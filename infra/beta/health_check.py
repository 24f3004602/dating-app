#!/usr/bin/env python3
"""The beta's health check (D143): hourly on the home-mode laptop (schedule-health.ps1),
or from cron on a server. It emails the owner only when something changes.

Conditions (each fails until fixed):
- services: every service of the compose project runs, and is healthy where it has a check;
- ready: the API answers /readyz at its public address (tunnel, edge and API together);
- backup: the newest good database backup is under 36 hours old;
- jobs: no background job has waited more than 30 minutes;
- errors: fewer than 5 server errors (5xx) in the API's last hour;
- sign-ins: fewer than 50 failed member sign-ins in the last hour (rate limits allow a few per address);
- disk: at least 5 GB free.
Events (reported once):
- a new "backup FAILED" line in backup.log or "update FAILED" in update.log; a new failed background job;
- any failed staff sign-in, two-factor or enrolment attempt (the console holds the most power).

Email goes through the beta's own SMTP settings in .env, to ALERT_EMAIL, else CONTACT_EMAIL,
else the sending address: one message when something starts failing, a reminder every 12
hours while it lasts, one when all is clear again, and a short weekly note when nothing has
been sent for 7 days, so a silent alert channel gets noticed. Only states and counts are
read or sent, never anything about members, and never a setting's value.

  py -I health_check.py            check, then email if needed (the scheduled task)
  py -I health_check.py --dry-run  check and print; no email, no state written
  py -I health_check.py --test     send one test message with the current results
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import smtplib
import socket
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

HERE = Path(__file__).resolve().parent
IST = timezone(timedelta(hours=5, minutes=30))
BACKUP_MAX_AGE_H = 36
JOB_WAIT_MIN = 30
ERRORS_PER_HOUR = 5
SIGN_IN_FAILURES_PER_HOUR = 50
DISK_MIN_GB = 5.0
REMIND_S = 12 * 3600
HEARTBEAT_S = 7 * 86400
COMMAND_TIMEOUT_S = 60
MEMBER_FAILURES = ("auth.login_failed", "auth.verify_failed")
STAFF_FAILURES = ("staff.login_failed", "staff.mfa_failed", "staff.enroll_failed")


def counts_sql(since: float) -> str:
    """failed jobs | minutes the oldest due job has waited (-1: none) | failed member sign-ins in
    the last hour | failed staff attempts since `since` (a Unix time this script made)."""
    members = ", ".join(f"'{a}'" for a in MEMBER_FAILURES)
    staff = ", ".join(f"'{a}'" for a in STAFF_FAILURES)
    return (
        "select (select count(*) from procrastinate_jobs where status = 'failed') || '|' || "
        "coalesce((select floor(extract(epoch from now() - min(coalesce(j.scheduled_at, e.at))) / 60)::int "
        "from procrastinate_jobs j left join procrastinate_events e on e.job_id = j.id and e.type = 'deferred' "
        "where j.status = 'todo' and (j.scheduled_at is null or j.scheduled_at <= now())), -1) || '|' || "
        f"(select count(*) from audit_log where action in ({members}) and created_at > now() - interval '1 hour') || '|' || "
        f"(select count(*) from audit_log where action in ({staff}) and created_at > to_timestamp({int(since)}))"
    )

Runner = Callable[[list[str]], tuple[int, str]]
Fetcher = Callable[[str], str | None]


@dataclass
class Results:
    """Conditions (name -> problem, or None when fine), what each found, and events."""

    problems: dict[str, str | None] = field(default_factory=dict)
    notes: dict[str, str] = field(default_factory=dict)
    events: list[str] = field(default_factory=list)
    log_offset: int = 0
    update_log_offset: int = 0
    failed_jobs: int | None = None

    @property
    def failing(self) -> dict[str, str]:
        return {name: problem for name, problem in self.problems.items() if problem}


# --- reading -------------------------------------------------------------------------------


def parse_env(text: str) -> dict[str, str]:
    """KEY=VALUE lines as compose reads them; comments and blank lines skipped."""
    values: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key] = value
    return values


def parse_compose_ps(text: str) -> list[dict[str, object]]:
    """`docker compose ps --format json`: JSON lines (compose 2.21+) or one array (older)."""
    text = text.strip()
    if not text:
        return []
    if text.startswith("["):
        return list(json.loads(text))
    return [json.loads(line) for line in text.splitlines() if line.strip()]


def services_problem(expected: list[str], ps: list[dict[str, object]]) -> str | None:
    by_service = {str(p.get("Service")): p for p in ps}
    bad = []
    for name in expected:
        found = by_service.get(name)
        if found is None:
            bad.append(f"{name} missing")
        elif found.get("State") != "running":
            bad.append(f"{name} {found.get('State') or 'stopped'}")
        elif found.get("Health") not in (None, "", "healthy"):
            bad.append(f"{name} {found.get('Health')}")
    return ", ".join(bad) or None


def newest_backup(backup_dir: Path) -> Path | None:
    dumps = [p for p in backup_dir.glob("db-*.dump") if p.is_file() and p.stat().st_size > 0]
    return max(dumps, key=lambda p: p.name) if dumps else None


def backup_problem(backup_dir: Path, now: float, max_age_h: float = BACKUP_MAX_AGE_H) -> tuple[str | None, str]:
    newest = newest_backup(backup_dir)
    if newest is None:
        return f"no database backup in {backup_dir}", "none"
    age_h = (now - newest.stat().st_mtime) / 3600
    note = f"{newest.name}, {age_h:.0f} h old"
    return (f"the newest backup is {age_h:.0f} hours old ({newest.name})" if age_h > max_age_h else None), note


def new_failures(log: Path, offset: int, marker: str = "backup FAILED") -> tuple[list[str], int]:
    """Lines with `marker` written since `offset`; a log that shrank is read from the start."""
    try:
        size = log.stat().st_size
    except FileNotFoundError:
        return [], 0
    if size < offset:
        offset = 0
    with log.open("rb") as fh:
        fh.seek(offset)
        chunk = fh.read()
    lines = [line.strip() for line in chunk.decode("utf-8", "replace").splitlines() if marker in line]
    return lines, size


def count_server_errors(log_text: str) -> int:
    """5xx answers in the API's JSON access log (`docker compose logs` may prefix each line)."""
    count = 0
    for line in log_text.splitlines():
        start = line.find("{")
        if start < 0:
            continue
        try:
            entry = json.loads(line[start:])
        except ValueError:
            continue
        if not isinstance(entry, dict):
            continue
        status = entry.get("status")
        if entry.get("event") == "http.request" and isinstance(status, int) and status >= 500:
            count += 1
    return count


def parse_counts(text: str) -> tuple[int, int, int, int]:
    """The four numbers of `counts_sql`."""
    failed, wait, members, staff = (int(n) for n in text.strip().split("|"))
    return failed, wait, members, staff


def disk_problem(path: Path, min_gb: float = DISK_MIN_GB) -> tuple[str | None, str]:
    usage = shutil.disk_usage(path if path.exists() else Path.home())
    free_gb = usage.free / 2**30
    return (f"only {free_gb:.1f} GB free" if free_gb < min_gb else None), f"{free_gb:.0f} GB free"


# --- deciding ------------------------------------------------------------------------------


def decide(state: dict[str, object], failing: dict[str, str], events: list[str], now: float) -> str | None:
    """Which message to send now: alert, reminder, recovered, started, heartbeat, or none."""
    before = set(state.get("failing", {}) or {})  # type: ignore[arg-type]
    current = set(failing)
    if events or current - before:
        return "alert"
    if current:
        last_alert = float(state.get("last_alert", 0) or 0)  # type: ignore[arg-type]
        return "reminder" if now - last_alert >= REMIND_S else None
    if before:
        return "recovered"
    if "last_run" not in state:
        return "started"  # the first run: proves the setup and the email path
    last_sent = float(state.get("last_sent", 0) or 0)  # type: ignore[arg-type]
    return "heartbeat" if now - last_sent >= HEARTBEAT_S else None


def next_state(state: dict[str, object], results: Results, kind: str | None, now: float) -> dict[str, object]:
    """The state after a run whose message (if any) was sent."""
    since = dict(state.get("failing", {}) or {})  # type: ignore[arg-type]
    new: dict[str, object] = dict(state)
    new["failing"] = {name: since.get(name, now) for name in results.failing}
    new["log_offset"] = results.log_offset
    new["update_log_offset"] = results.update_log_offset
    if results.failed_jobs is not None:
        new["failed_jobs"] = results.failed_jobs
    new["last_run"] = now
    if kind is not None:
        new["last_sent"] = now
    if kind in ("alert", "reminder"):
        new["last_alert"] = now
    return new


SUBJECTS = {
    "alert": "Problem: {names}",
    "reminder": "Still failing: {names}",
    "recovered": "All clear again",
    "started": "The health check is on: all well",
    "heartbeat": "Weekly check: all well",
    "test": "Test message from the health check",
}


def compose_message(kind: str, results: Results, brand: str, host: str, now: float) -> tuple[str, str]:
    names = ", ".join(results.failing) or ("events" if results.events else "none")
    subject = f"[{brand} beta] " + SUBJECTS[kind].format(names=names)
    at = datetime.fromtimestamp(now, IST).strftime("%Y-%m-%d %H:%M IST")
    lines = [f"The beta's health check on {host}, {at}.", ""]
    for name, problem in results.problems.items():
        if problem:
            lines.append(f"FAIL  {name}: {problem}")
        else:
            lines.append(f"ok    {name}: {results.notes.get(name, 'fine')}")
    if results.events:
        lines += ["", "Since the last check:"] + [f"- {event}" for event in results.events]
    lines += [
        "",
        "What to look at: replica/deploy.md (Running it day to day, Incident response).",
        "This check runs every hour (infra/beta/health_check.py); it writes only when something changes,",
        "and once a week when all is well.",
    ]
    return subject, "\n".join(lines) + "\n"


# --- checking ------------------------------------------------------------------------------


def docker_runner(args: list[str]) -> tuple[int, str]:
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)  # no console flash on Windows
    try:
        done = subprocess.run(  # noqa: S603 - fixed docker commands, no shell
            args, cwd=HERE, capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=COMMAND_TIMEOUT_S, creationflags=flags, check=False,
        )  # fmt: skip
    except (OSError, subprocess.TimeoutExpired) as exc:
        return 1, type(exc).__name__
    return done.returncode, done.stdout


def fetch_ready(url: str) -> str | None:
    request = urllib.request.Request(url, headers={"User-Agent": "datingapp-health-check/1"})  # noqa: S310
    try:
        with urllib.request.urlopen(request, timeout=20) as res:  # noqa: S310 - our own https URL
            return None if res.status == 200 else f"{url} answered {res.status}"
    except urllib.error.HTTPError as exc:
        return f"{url} answered {exc.code}"
    except (urllib.error.URLError, OSError) as exc:
        return f"{url} unreachable ({type(exc).__name__})"


def collect(
    env: dict[str, str], state: dict[str, object], backup_dir: Path, now: float,
    runner: Runner = docker_runner, fetch: Fetcher = fetch_ready,
) -> Results:  # fmt: skip
    r = Results()

    code, out = runner(["docker", "compose", "config", "--services"])
    expected = [s for s in out.split() if s] if code == 0 else []
    code, ps_out = runner(["docker", "compose", "ps", "--all", "--format", "json"])
    if not expected or code != 0:
        r.problems["services"] = "docker didn't answer (is Docker Desktop running?)"
    else:
        try:
            r.problems["services"] = services_problem(expected, parse_compose_ps(ps_out))
        except ValueError:
            r.problems["services"] = "docker compose ps gave output that isn't JSON"
        r.notes["services"] = f"{len(expected)} running"

    domain = env.get("DOMAIN", "")
    r.problems["ready"] = fetch(f"https://api.{domain}/readyz") if domain else "DOMAIN isn't set in .env"
    r.notes["ready"] = f"https://api.{domain}/readyz answered 200"

    r.problems["backup"], r.notes["backup"] = backup_problem(backup_dir, now)
    failures, r.log_offset = new_failures(backup_dir / "backup.log", int(state.get("log_offset", 0) or 0))  # type: ignore[arg-type]
    r.events += failures
    offset = int(state.get("update_log_offset", 0) or 0)  # type: ignore[arg-type]
    failures, r.update_log_offset = new_failures(backup_dir / "update.log", offset, "update FAILED")
    r.events += failures

    since = float(state.get("last_run", 0) or 0) or now - 3600  # type: ignore[arg-type]
    psql = ["docker", "compose", "exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "datingapp", "-Atc"]
    code, out = runner([*psql, counts_sql(since)])
    try:
        counts = parse_counts(out) if code == 0 else None
    except ValueError:
        counts = None
    if counts is None:
        r.problems["jobs"] = "the job queue couldn't be read"
        r.problems["sign-ins"] = "the audit log couldn't be read"
    else:
        failed, wait, members, staff = counts
        r.failed_jobs = failed
        seen = int(state.get("failed_jobs", 0) or 0)  # type: ignore[arg-type]
        if failed > seen:
            r.events.append(f"{failed - seen} background job(s) failed ({failed} failed in all)")
        r.problems["jobs"] = f"a job has waited {wait} minutes" if wait > JOB_WAIT_MIN else None
        r.notes["jobs"] = "none waiting" if wait < 0 else f"oldest waiting {wait} min"
        too_many = members >= SIGN_IN_FAILURES_PER_HOUR
        r.problems["sign-ins"] = f"{members} failed member sign-ins in the last hour" if too_many else None
        r.notes["sign-ins"] = f"{members} failed in the last hour"
        if staff:
            r.events.append(f"{staff} failed staff sign-in, two-factor or enrolment attempt(s) since the last check")

    code, out = runner(["docker", "compose", "logs", "--since", "60m", "--no-log-prefix", "api"])
    if code != 0:
        r.problems["errors"] = "the API's log couldn't be read"
    else:
        errors = count_server_errors(out)
        r.problems["errors"] = f"{errors} server errors (5xx) in the last hour" if errors >= ERRORS_PER_HOUR else None
        r.notes["errors"] = f"{errors} server errors in the last hour"

    r.problems["disk"], r.notes["disk"] = disk_problem(backup_dir)
    return r


# --- sending -------------------------------------------------------------------------------


def recipient(env: dict[str, str]) -> str:
    for key in ("ALERT_EMAIL", "CONTACT_EMAIL", "SMTP_USERNAME"):
        value = os.environ.get(key) or env.get(key)
        if value:
            return value
    raise RuntimeError("no address to write to (ALERT_EMAIL, CONTACT_EMAIL or SMTP_USERNAME)")


def send(env: dict[str, str], to: str, subject: str, body: str) -> None:
    host = env.get("SMTP_HOST") or "smtp.gmail.com"
    port = int(env.get("SMTP_PORT") or 587)
    security = env.get("SMTP_SECURITY") or "starttls"
    user, password = env["SMTP_USERNAME"], env["SMTP_PASSWORD"]
    message = EmailMessage()
    message["From"], message["To"], message["Subject"] = user, to, subject
    message.set_content(body)
    context = ssl.create_default_context()
    if security == "tls":
        with smtplib.SMTP_SSL(host, port, timeout=30, context=context) as smtp:
            smtp.login(user, password)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            smtp.starttls(context=context)
            smtp.login(user, password)
            smtp.send_message(message)


def default_backup_dir() -> Path:
    if os.environ.get("BACKUP_DIR"):
        return Path(os.environ["BACKUP_DIR"])
    return Path.home() / "datingapp-backups" if os.name == "nt" else Path("/var/backups/datingapp-beta")


def append_log(path: Path, line: str, keep: int = 5000) -> None:
    lines = path.read_text(encoding="utf-8").splitlines() if path.exists() else []
    path.write_text("\n".join([*lines[-(keep - 1):], line]) + "\n", encoding="utf-8")


def load_env() -> dict[str, str]:
    path = HERE / ".env"
    return parse_env(path.read_text(encoding="utf-8")) if path.exists() else {}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="check and print; no email, no state written")
    parser.add_argument("--test", action="store_true", help="send one test message with the current results")
    args = parser.parse_args(argv)

    env = load_env()
    backup_dir = default_backup_dir()
    state_path = backup_dir / "health-state.json"
    try:
        state = json.loads(state_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        state = {}
    now = time.time()
    results = collect(env, state, backup_dir, now)
    kind = "test" if args.test else decide(state, results.failing, results.events, now)
    brand = env.get("BRAND_NAME") or "datingapp"
    subject, body = compose_message(kind or "heartbeat", results, brand, socket.gethostname(), now)
    stamp = datetime.fromtimestamp(now, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    summary = "ok" if not results.failing else "FAIL " + ",".join(results.failing)
    if results.events:
        summary += f" (+{len(results.events)} event(s))"

    if args.dry_run:
        print(body if kind is None else f"Would send: {subject}\n\n{body}", end="")
        print(f"{stamp} {summary}; would send: {kind or 'nothing'}")
        return 1 if results.failing else 0

    sent_note = "nothing sent"
    if kind is not None:
        try:
            send(env, recipient(env), subject, body)
            sent_note = f"sent {kind}"
        except (OSError, smtplib.SMTPException, KeyError, RuntimeError, ValueError) as exc:
            # The state stays as it was, so the next run tries the same message again.
            append_log(backup_dir / "health.log", f"{stamp} {summary}; sending {kind} FAILED ({type(exc).__name__})")
            print(f"{stamp} {summary}; sending {kind} FAILED ({type(exc).__name__})", file=sys.stderr)
            return 2
    if kind != "test":
        backup_dir.mkdir(parents=True, exist_ok=True)
        state_path.write_text(json.dumps(next_state(state, results, kind, now), indent=1), encoding="utf-8")
    append_log(backup_dir / "health.log", f"{stamp} {summary}; {sent_note}")
    print(f"{stamp} {summary}; {sent_note}")
    return 1 if results.failing else 0


if __name__ == "__main__":
    sys.exit(main())
