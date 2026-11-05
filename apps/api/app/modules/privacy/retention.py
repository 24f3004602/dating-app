"""Retention periods: the privacy inventory's rules, in one place (D084).

Every period here appears in `replica/privacy-data-inventory.md`; change both
together. Periods marked (R) there need a lawyer's confirmation before launch.
The audit trail and moderation records (3 years) are purged by a database
function with the period fixed inside it (migration 0009), so the app cannot
delete recent records.
"""

from __future__ import annotations

from datetime import timedelta

# Account deletion (D083).
ACCOUNT_GRACE = timedelta(days=7)  # hidden at once; purged after this
REPORT_HOLD_MAX = timedelta(days=30)  # an open report about the account delays the purge, at most this long
BANNED_ACCOUNT = timedelta(days=90)  # (R) a banned account is purged this long after the ban
DELETED_ACCOUNT_RECORD = timedelta(days=365)  # (R) consent proof and, for bans, the email hash
UNVERIFIED_ACCOUNT = timedelta(days=7)  # sign-ups whose email was never confirmed

# Conversations and discovery.
CLOSED_CONVERSATION = timedelta(days=30)  # after unmatch, block, ban or deletion (reports keep their copy)
DAILY_PICKS_DAYS = 7

# Authentication.
ENDED_SESSION = timedelta(days=30)  # after expiry or revocation
EXPIRED_CODE = timedelta(days=1)
ENDED_ENROLLMENT = timedelta(days=30)  # staff enrolment tokens, after use or expiry

# Safety.
REPORTER_LINK = timedelta(days=90)  # (R) after resolution, the report no longer names its reporter
RESOLVED_REPORT = timedelta(days=730)  # (R) after resolution, the report is deleted

# Background jobs: finished or failed job rows (IDs and kinds only).
FINISHED_JOB_HOURS = 30 * 24
