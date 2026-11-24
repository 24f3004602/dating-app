"""Tests for health_check.py (D143): HEALTH-1..9 in replica/test-plan.md.

    python -m unittest -v test_health_check      (from infra/beta; CI's beta-stack runs it)
"""

from __future__ import annotations

import json
import os
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

import health_check as hc

NOW = 1_800_000_000.0
SERVICES = "postgres\nredis\napi\nweb\nedge\ntunnel\nworker\n"


def ps_line(service: str, state: str = "running", health: str = "") -> str:
    return json.dumps({"Service": service, "State": state, "Health": health})


def healthy_ps() -> str:
    healthy = {"postgres", "redis", "api", "web"}
    return "\n".join(ps_line(s, health="healthy" if s in healthy else "") for s in SERVICES.split())


def access_line(status: int) -> str:
    return json.dumps({"level": "INFO", "event": "http.request", "status": status, "route": "/v1/me"})


class FakeDocker:
    """Answers the health check's docker commands from fixed text."""

    def __init__(self, ps: str | None = None, jobs: str = "0|-1|0|0", logs: str = "", up: bool = True) -> None:
        self.ps = healthy_ps() if ps is None else ps
        self.jobs, self.logs, self.up = jobs, logs, up

    def __call__(self, args: list[str]) -> tuple[int, str]:
        if not self.up:
            return 1, ""
        joined = " ".join(args)
        if "config --services" in joined:
            return 0, SERVICES
        if " ps " in f" {joined} ":
            return 0, self.ps
        if "psql" in joined:
            return 0, self.jobs + "\n"
        if " logs " in f" {joined} ":
            return 0, self.logs
        raise AssertionError(f"unexpected command: {joined}")


class Backups:
    """A temporary backup folder with one good dump of a given age."""

    def __init__(self, age_h: float | None = 5) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        if age_h is not None:
            dump = self.dir / "db-20261123T060625Z.dump"
            dump.write_bytes(b"PGDMP")
            os.utime(dump, (NOW - age_h * 3600, NOW - age_h * 3600))

    def __enter__(self) -> Path:
        return self.dir

    def __exit__(self, *exc: object) -> None:
        self.tmp.cleanup()


ENV = {"DOMAIN": "example.test", "BRAND_NAME": "Kinaara", "SMTP_USERNAME": "beta@example.test",
       "SMTP_PASSWORD": "abcd efgh ijkl mnop", "CONTACT_EMAIL": "owner@example.test"}  # fmt: skip


def run_collect(backup_dir: Path, state: dict | None = None, **docker: object) -> hc.Results:
    with mock.patch.object(hc, "disk_problem", return_value=(None, "100 GB free")):
        return hc.collect(ENV, state or {}, backup_dir, NOW, runner=FakeDocker(**docker), fetch=lambda url: None)


class ReadingTests(unittest.TestCase):
    def test_env_file(self) -> None:  # HEALTH-1
        env = hc.parse_env("# comment\nA=1\n export B = two words \nC='quoted'\nD=\"x=y\"\nbad line\n\nE=\n")
        self.assertEqual(env, {"A": "1", "B": "two words", "C": "quoted", "D": "x=y", "E": ""})

    def test_services(self) -> None:  # HEALTH-2
        expected = SERVICES.split()
        self.assertIsNone(hc.services_problem(expected, hc.parse_compose_ps(healthy_ps())))
        as_array = "[" + ",".join(healthy_ps().splitlines()) + "]"
        self.assertIsNone(hc.services_problem(expected, hc.parse_compose_ps(as_array)))
        broken = "\n".join([ps_line("postgres", health="healthy"), ps_line("api", health="unhealthy"),
                            ps_line("worker", state="exited")])  # fmt: skip
        problem = hc.services_problem(["postgres", "api", "worker", "tunnel"], hc.parse_compose_ps(broken))
        self.assertEqual(problem, "api unhealthy, worker exited, tunnel missing")

    def test_backup_age(self) -> None:  # HEALTH-3
        with Backups(age_h=5) as d:
            problem, note = hc.backup_problem(d, NOW)
            self.assertIsNone(problem)
            self.assertIn("5 h old", note)
            (d / "db-20261124T000000Z.dump").write_bytes(b"")  # an empty dump never counts
            self.assertEqual(hc.newest_backup(d).name, "db-20261123T060625Z.dump")
        with Backups(age_h=40) as d:
            self.assertIn("40 hours old", hc.backup_problem(d, NOW)[0])
        with Backups(age_h=None) as d:
            self.assertIn("no database backup", hc.backup_problem(d, NOW)[0])

    def test_backup_failures_since_last_time(self) -> None:  # HEALTH-4
        with Backups() as d:
            log = d / "backup.log"
            log.write_text("backup: a\nbackup FAILED at 2026-11-23T03:55:50Z (database dump)\n", encoding="utf-8")
            lines, offset = hc.new_failures(log, 0)
            self.assertEqual(lines, ["backup FAILED at 2026-11-23T03:55:50Z (database dump)"])
            self.assertEqual(hc.new_failures(log, offset), ([], offset))  # nothing new
            with log.open("a", encoding="utf-8") as fh:
                fh.write("backup: b\n")
            self.assertEqual(hc.new_failures(log, offset)[0], [])
            log.write_text("backup FAILED at x (photos check)\n", encoding="utf-8")  # replaced, shorter
            self.assertEqual(hc.new_failures(log, 10_000)[0], ["backup FAILED at x (photos check)"])
            self.assertEqual(hc.new_failures(d / "missing.log", 5), ([], 0))

    def test_update_failures(self) -> None:  # HEALTH-4
        with Backups() as d:
            (d / "update.log").write_text("x update: nothing new\nx update FAILED (restart)\n", encoding="utf-8")
            r = run_collect(d)
            self.assertEqual(r.events, ["x update FAILED (restart)"])
            state = hc.next_state({}, r, "alert", NOW)
            self.assertEqual(state["update_log_offset"], (d / "update.log").stat().st_size)
            self.assertEqual(run_collect(d, state=state).events, [])

    def test_server_errors(self) -> None:  # HEALTH-5
        text = "\n".join([access_line(200), access_line(503), "api-1  | " + access_line(500), "not json",
                          json.dumps([1, 2]), json.dumps({"event": "other", "status": 500}), access_line(404)])  # fmt: skip
        self.assertEqual(hc.count_server_errors(text), 2)

    def test_counts(self) -> None:
        self.assertEqual(hc.parse_counts("3|-1|0|0\n"), (3, -1, 0, 0))
        self.assertEqual(hc.parse_counts("0|45|12|1"), (0, 45, 12, 1))
        with self.assertRaises(ValueError):
            hc.parse_counts("0|45")
        sql = hc.counts_sql(1_800_000_000.9)
        self.assertIn("to_timestamp(1800000000)", sql)
        self.assertIn("'auth.login_failed', 'auth.verify_failed'", sql)
        self.assertIn("'staff.login_failed', 'staff.mfa_failed', 'staff.enroll_failed'", sql)


class CollectTests(unittest.TestCase):
    def test_all_well(self) -> None:  # HEALTH-6
        with Backups() as d:
            r = run_collect(d)
        self.assertEqual(r.failing, {})
        self.assertEqual(r.events, [])
        self.assertEqual(set(r.problems), {"services", "ready", "backup", "jobs", "sign-ins", "errors", "disk"})

    def test_each_problem(self) -> None:  # HEALTH-6
        with Backups(age_h=50) as d:
            r = run_collect(d, ps=ps_line("api", health="unhealthy"), jobs="0|45|50|0",
                            logs="\n".join([access_line(500)] * 5))  # fmt: skip
        self.assertEqual(set(r.failing), {"services", "backup", "jobs", "sign-ins", "errors"})
        with Backups() as d:
            r = run_collect(d, up=False)
        self.assertIn("docker didn't answer", r.failing["services"])
        self.assertEqual(r.failing["jobs"], "the job queue couldn't be read")
        self.assertEqual(r.failing["sign-ins"], "the audit log couldn't be read")

    def test_new_failed_jobs_are_events(self) -> None:  # HEALTH-6
        with Backups() as d:
            r = run_collect(d, state={"failed_jobs": 1}, jobs="3|-1|0|0")
            self.assertEqual(r.events, ["2 background job(s) failed (3 failed in all)"])
            self.assertEqual(r.failed_jobs, 3)
            self.assertEqual(run_collect(d, state={"failed_jobs": 3}, jobs="3|-1|0|0").events, [])

    def test_sign_in_failures(self) -> None:  # HEALTH-6
        with Backups() as d:
            r = run_collect(d, jobs="0|-1|49|0")
            self.assertNotIn("sign-ins", r.failing)
            self.assertEqual(r.notes["sign-ins"], "49 failed in the last hour")
            failing = run_collect(d, jobs="0|-1|50|0").failing
            self.assertEqual(failing["sign-ins"], "50 failed member sign-ins in the last hour")
            staff = run_collect(d, jobs="0|-1|0|2")
            self.assertEqual(staff.events, ["2 failed staff sign-in, two-factor or enrolment attempt(s) since the last check"])
            self.assertEqual(staff.failing, {})


class DecideTests(unittest.TestCase):
    def test_the_life_of_an_alert(self) -> None:  # HEALTH-7
        r_ok, r_bad, r_worse = hc.Results(), hc.Results(), hc.Results()
        r_ok.problems = {"services": None, "backup": None}
        r_bad.problems = {"services": "api unhealthy", "backup": None}
        r_worse.problems = {"services": "api unhealthy", "backup": "40 hours old"}
        t = NOW
        state: dict = {}
        steps = []
        for results, dt in [(r_ok, 0), (r_ok, 3600), (r_bad, 3600), (r_bad, 3600), (r_bad, 12 * 3600),
                            (r_worse, 3600), (r_ok, 3600), (r_ok, 3600), (r_ok, 7 * 86400)]:  # fmt: skip
            t += dt
            kind = hc.decide(state, results.failing, results.events, t)
            steps.append(kind)
            state = hc.next_state(state, results, kind, t)
        self.assertEqual(steps, ["started", None, "alert", None, "reminder", "alert", "recovered", None, "heartbeat"])
        self.assertEqual(state["failing"], {})

    def test_events_alert_once_without_a_recovery(self) -> None:  # HEALTH-7
        state = {"last_run": NOW, "last_sent": NOW, "failing": {}}
        event = hc.Results(problems={"backup": None}, events=["backup FAILED at x (database dump)"])
        kind = hc.decide(state, event.failing, event.events, NOW + 60)
        self.assertEqual(kind, "alert")
        state = hc.next_state(state, event, kind, NOW + 60)
        quiet = hc.Results(problems={"backup": None})
        self.assertIsNone(hc.decide(state, quiet.failing, quiet.events, NOW + 3660))

    def test_failing_since_is_kept(self) -> None:  # HEALTH-7
        bad = hc.Results(problems={"ready": "down"})
        state = hc.next_state({}, bad, "alert", NOW)
        state = hc.next_state(state, bad, None, NOW + 3600)
        self.assertEqual(state["failing"], {"ready": NOW})
        self.assertEqual(state["last_alert"], NOW)


class MessageTests(unittest.TestCase):
    def test_message_holds_states_never_settings(self) -> None:  # HEALTH-8
        with Backups(age_h=50) as d:
            r = run_collect(d, ps=ps_line("api", health="unhealthy"))
        r.events.append("backup FAILED at x (database dump)")
        subject, body = hc.compose_message("alert", r, "Kinaara", "laptop", NOW)
        self.assertEqual(subject, "[Kinaara beta] Problem: services, backup")
        self.assertIn("FAIL  services: postgres missing, redis missing, api unhealthy", body)
        self.assertIn("ok    disk: 100 GB free", body)
        self.assertIn("- backup FAILED at x (database dump)", body)
        for name, value in ENV.items():
            if name in ("SMTP_PASSWORD", "SMTP_USERNAME", "CONTACT_EMAIL"):
                self.assertNotIn(value, subject + body)

    def test_recipient_order(self) -> None:  # HEALTH-9
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(hc.recipient(ENV), "owner@example.test")
            self.assertEqual(hc.recipient({**ENV, "ALERT_EMAIL": "alerts@example.test"}), "alerts@example.test")
            self.assertEqual(hc.recipient({"SMTP_USERNAME": "beta@example.test"}), "beta@example.test")
            with self.assertRaises(RuntimeError):
                hc.recipient({})

    def test_a_failed_send_keeps_the_state(self) -> None:  # HEALTH-9
        with Backups() as d, mock.patch.dict(os.environ, {"BACKUP_DIR": str(d)}), \
                mock.patch.object(hc, "collect", return_value=hc.Results(problems={"ready": "down"})), \
                mock.patch.object(hc, "send", side_effect=OSError("no network")), \
                mock.patch.object(hc, "load_env", return_value=ENV):  # fmt: skip
            (d / "health-state.json").write_text(json.dumps({"last_run": 1.0, "failing": {}}), encoding="utf-8")
            self.assertEqual(hc.main([]), 2)
            self.assertEqual(json.loads((d / "health-state.json").read_text(encoding="utf-8")), {"last_run": 1.0, "failing": {}})
            self.assertIn("sending alert FAILED (OSError)", (d / "health.log").read_text(encoding="utf-8"))
            sent = []
            with mock.patch.object(hc, "send", side_effect=lambda *a: sent.append(a[2])):
                self.assertEqual(hc.main([]), 1)  # still failing, but the alert went out
            self.assertEqual(sent, ["[Kinaara beta] Problem: ready"])
            self.assertIn("ready", json.loads((d / "health-state.json").read_text(encoding="utf-8"))["failing"])


if __name__ == "__main__":
    unittest.main()
