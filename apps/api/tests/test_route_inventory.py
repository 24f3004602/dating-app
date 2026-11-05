"""Every route needs a session unless it is on this list (stage 15 audit, T05).

A new route that forgets its session dependency fails here, before review.
Routes on the list check something else themselves: signed media URLs check
their HMAC, the realtime socket redeems a single-use ticket, and the auth
routes are the way in.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from fastapi import FastAPI
from fastapi.routing import APIRoute, APIWebSocketRoute

from app.modules.auth.deps import current_session, current_staff_session

PUBLIC = {
    ("GET", "/healthz"),
    ("GET", "/readyz"),
    ("POST", "/v1/auth/register"),
    ("POST", "/v1/auth/verify-email"),
    ("POST", "/v1/auth/resend-code"),
    ("POST", "/v1/auth/login"),
    ("POST", "/v1/auth/restore"),
    ("POST", "/v1/auth/password-reset/request"),
    ("POST", "/v1/auth/password-reset/confirm"),
    ("GET", "/v1/media/blob/{key:path}"),  # HMAC-signed, 5-minute URLs
    ("WS", "/v1/realtime"),  # a single-use ticket from POST /v1/realtime/ticket
    ("POST", "/v1/admin/auth/login"),
    ("POST", "/v1/admin/auth/enroll"),  # needs the challenge from login
    ("POST", "/v1/admin/auth/verify"),  # needs the challenge from login
    ("POST", "/v1/webhooks/razorpay"),  # HMAC-signed by the provider; checked before anything else
}


def _flat(routes: list[Any]) -> Iterator[Any]:
    for route in routes:
        if hasattr(route, "original_router"):  # FastAPI's lazily included routers
            yield from _flat(route.original_router.routes)
        else:
            yield route


def _calls(dependant: Any) -> set[Any]:
    found: set[Any] = set()
    for dep in dependant.dependencies:
        found.add(dep.call)
        found |= _calls(dep)
    return found


async def test_only_the_listed_routes_are_public_and_admin_routes_need_a_staff_session(app: FastAPI) -> None:
    public, member, staff = set(), set(), set()
    for route in _flat(app.routes):
        if not isinstance(route, (APIRoute, APIWebSocketRoute)):
            continue
        calls = _calls(route.dependant)
        for method in sorted(getattr(route, "methods", None) or {"WS"}):
            key = (method, route.path)
            if current_staff_session in calls:
                staff.add(key)
            elif current_session in calls:
                member.add(key)
            else:
                public.add(key)
    assert public == PUBLIC
    admin_paths = {key for key in public | member | staff if key[1].startswith("/v1/admin/")}
    assert admin_paths - staff == {k for k in PUBLIC if k[1].startswith("/v1/admin/")}  # only the sign-in steps
    assert not {key for key in staff if not key[1].startswith("/v1/admin/")}  # staff sessions only in the console API
    assert len(member) >= 30  # sanity: the walk found the member routes
