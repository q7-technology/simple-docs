from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column

from sdocs.models.base import Base, created_at_column, uuid_pk

ROLES = ("admin", "editor", "reviewer")


class AppUser(Base):
    """Someone who signs in. Deactivated, never deleted: a trigger refuses a
    DELETE, so documents keep their authors and reviewers (rule 1)."""

    __tablename__ = "app_user"
    __table_args__ = (
        CheckConstraint("username = lower(username)", name="username_lower"),
        CheckConstraint("role in ('admin', 'editor', 'reviewer')", name="role"),
        CheckConstraint("failed_attempts >= 0", name="failed_attempts"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # kept lower case, matched however it is typed
    username: Mapped[str] = mapped_column(String(64), unique=True)
    # argon2id (sdocs/services/access.py); never the password
    password_hash: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # wrong passwords in a row; five lock the password until locked_until
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sign_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()
    # who added them; null for the first admin (first run) and the command line
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))


class UserSession(Base):
    """One signed-in browser (or script with a cookie jar). Only the token's
    SHA-256 is kept. Ends 12 hours after its last request, 14 days after
    sign-in whatever happens, on sign-out, on a new password and on
    deactivation (sdocs/services/sessions.py)."""

    __tablename__ = "session"
    __table_args__ = (CheckConstraint("length(token_hash) = 64", name="token_hash_sha256"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = created_at_column()
    # the person who signed in: whose session it is
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
