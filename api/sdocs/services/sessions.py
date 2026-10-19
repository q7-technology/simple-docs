"""Sessions: one random token per signed-in browser, kept only as its
SHA-256. A session ends 12 hours after its last request (sliding), 14 days
after sign-in whatever happens, on sign-out, when the person's password is
set anew (their other sessions), and when they are deactivated (all)."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session as Db

from sdocs.models import AppUser, UserSession

PREFIX = "sdocs_s."
IDLE = timedelta(hours=12)
LIFETIME = timedelta(days=14)
# last_seen_at is written at most once a minute, not on every request
TOUCH_EVERY = timedelta(minutes=1)

# What each role may do (the design's screens table). Users, settings,
# templates and spend are admin-only: the admin's "*" alone. Later steps
# check the others, and add to these lists when they need to.
SCOPES: dict[str, list[str]] = {
    "reviewer": ["documents:read", "clients:read", "reviews:write"],
    "editor": ["documents:read", "documents:write", "clients:read", "clients:write"],
    "admin": ["*"],
}


def scopes_for(role: str) -> list[str]:
    return list(SCOPES.get(role, []))


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def start(db: Db, user: AppUser, now: datetime | None = None) -> str:
    """A new session; the raw token is returned once and never stored."""
    now = now or datetime.now(UTC)
    raw = PREFIX + secrets.token_urlsafe(32)
    db.add(UserSession(created_by=user.id, token_hash=_hash(raw), last_seen_at=now,
                       expires_at=now + LIFETIME))
    db.flush()
    return raw


def find(db: Db, raw: str, now: datetime | None = None) -> UserSession | None:
    """The live session for this token, marked as just used; None if it is
    not ours, ended, too old or idle too long."""
    if not raw.startswith(PREFIX):
        return None
    now = now or datetime.now(UTC)
    row = db.execute(
        select(UserSession).where(UserSession.token_hash == _hash(raw))
    ).scalar_one_or_none()
    if (row is None or row.revoked_at is not None or row.expires_at <= now
            or now - row.last_seen_at > IDLE):
        return None
    if now - row.last_seen_at >= TOUCH_EVERY:
        row.last_seen_at = now
        db.flush()
    return row


def end(db: Db, raw: str) -> None:
    db.execute(update(UserSession).where(UserSession.token_hash == _hash(raw),
                                         UserSession.revoked_at.is_(None))
               .values(revoked_at=datetime.now(UTC)))
    db.flush()


def end_all(db: Db, user: AppUser, keep: UserSession | None = None) -> None:
    """End every session of this person, but `keep` (the one asking) if given."""
    q = update(UserSession).where(UserSession.created_by == user.id,
                                  UserSession.revoked_at.is_(None))
    if keep is not None:
        q = q.where(UserSession.id != keep.id)
    db.execute(q.values(revoked_at=datetime.now(UTC)))
    db.flush()
