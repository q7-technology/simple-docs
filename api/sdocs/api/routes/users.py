"""People who sign in, looked after by an admin. Deactivated, never
deleted: there is no DELETE here, and the database refuses one (rule 1)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from sdocs.api.deps import DB, Principal, require
from sdocs.api.errors import ApiError, commit_unique, invalid
from sdocs.api.schemas import Name, NewPassword, Role, Username
from sdocs.models import AppUser
from sdocs.services import access

router = APIRouter(prefix="/users", tags=["users"])

Reader = Annotated[Principal, require("users:read")]
Admin = Annotated[Principal, require("users:write")]


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: str
    active: bool
    # five wrong passwords: it clears itself after 15 minutes, or with a new password
    locked: bool
    last_sign_in_at: datetime | None
    created_at: datetime


class UsersOut(BaseModel):
    items: list[UserOut]


def user_out(user: AppUser) -> UserOut:
    locked = user.locked_until is not None and user.locked_until > datetime.now(UTC)
    return UserOut(id=user.id, username=user.username, display_name=user.display_name,
                   role=user.role, active=user.active, locked=locked,
                   last_sign_in_at=user.last_sign_in_at, created_at=user.created_at)


def username_taken() -> ApiError:
    return invalid("username", "That username is taken.")


@router.get("", response_model=UsersOut)
def list_users(db: DB, who: Reader):
    """Everyone, active first, then by name."""
    rows = db.execute(select(AppUser).order_by(AppUser.active.desc(),
                                               func.lower(AppUser.display_name))).scalars()
    return UsersOut(items=[user_out(u) for u in rows])


class UserIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Username
    display_name: Name
    role: Role
    password: NewPassword


@router.post("", status_code=201, response_model=UserOut)
def add_user(body: UserIn, db: DB, who: Admin):
    if db.execute(select(AppUser.id).where(AppUser.username == body.username)).first():
        raise username_taken()
    user = AppUser(username=body.username, display_name=body.display_name, role=body.role,
                   password_hash=access.hash_password(body.password), active=True,
                   failed_attempts=0, created_by=who.user.id)
    db.add(user)
    commit_unique(db, {"uq_app_user_username": username_taken()})
    return user_out(user)
