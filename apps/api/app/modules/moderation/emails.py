"""The operator's alert for urgent reports (stage 28e, D157). Counts, a time and a link only:
no names, no report text, nothing about the people involved (privacy inventory), because the
message passes through an email provider."""

from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.modules.safety.models import ReportReason
from app.providers.email import EmailMessage

# The words the app's report form uses (apps/mobile/src/i18n/en.ts, report.reasons).
LABELS = {
    ReportReason.underage: "might be under 18",
    ReportReason.explicit: "sexual or explicit content",
    ReportReason.fake: "fake profile or pretending to be someone else",
}


def urgent_reports(
    to: str, *, brand: str, site_url: str, counts: dict[ReportReason, int], oldest: datetime, now: datetime, tz: str
) -> EmailMessage:
    total = sum(counts.values())
    when = oldest.astimezone(ZoneInfo(tz)).strftime("%H:%M")
    minutes = max(0, int((now - oldest).total_seconds() // 60))
    lines = "\n".join(f"- {n} {LABELS[reason]}" for reason, n in sorted(counts.items(), key=lambda kv: kv[0].value))
    plural = "report" if total == 1 else "reports"
    return EmailMessage(
        to=to,
        subject=f"[{brand}] {total} urgent {plural} to review",
        text=(
            f"{total} {plural} need a moderator now:\n{lines}\n\n"
            f"The oldest arrived at {when} (India time), {minutes} minutes ago.\n\n"
            "India's IT Rules give two hours to remove or block an image that shows someone naked or in a "
            "sexual act, or pretends to be them. A reported photo is already hidden from members until you "
            "decide; a reported profile isn't.\n\n"
            f"Open the queue: {site_url}/admin\n\n"
            "This message names no one. It comes because MODERATION_ALERT_EMAIL is set on the server."
        ),
    )
