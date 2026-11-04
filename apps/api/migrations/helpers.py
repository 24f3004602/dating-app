"""Shared helpers for migration scripts."""

from __future__ import annotations

import re

from alembic import op

_ROLE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


def runtime_role() -> str:
    """The runtime role that migrations grant DML to (set by env.py)."""
    ctx = op.get_context()
    role = ctx.config.attributes.get("runtime_role") if ctx.config is not None else None
    if not isinstance(role, str) or not _ROLE.fullmatch(role):
        raise RuntimeError("runtime role must be a lowercase PostgreSQL identifier")
    return role


def is_external_table(name: str | None) -> bool:
    """Tables owned by a vendored schema (not by our models)."""
    return bool(name and name.startswith("procrastinate_"))


def include_name(name: str | None, type_: str, parent_names: object) -> bool:
    """Autogenerate ignores tables that a vendored schema owns (procrastinate)."""
    return not (type_ == "table" and is_external_table(name))
