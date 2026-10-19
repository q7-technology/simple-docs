"""People who sign in, looked after by an admin. Deactivated, never
deleted: there is no DELETE here, and the database refuses one (rule 1)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session as Db

from sdocs.api.deps import DB, Principal, require
from sdocs.api.errors import ApiError, commit_unique, forbidden, invalid, not_found
from sdocs.api.schemas import Name, NewPassword, Role, Username
from sdocs.models import AppUser
from sdocs.services import access, sessions

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


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: Name | None = None
    role: Role | None = None
    active: bool | None = None


def no_such_user() -> ApiError:
    return not_found("There's no user with that id.")


def lock_admins(db: Db, who: Principal) -> list[AppUser]:
    """Every active admin's row, locked in id order, and the caller still one
    of them. Any code that locks more than one app_user row locks these first,
    in this order, so two requests never wait on each other's rows."""
    admins = list(db.execute(select(AppUser)
                             .where(AppUser.role == "admin", AppUser.active.is_(True))
                             .order_by(AppUser.id).with_for_update()
                             .execution_options(populate_existing=True)).scalars())
    # demoted or deactivated after this request's session was checked
    if who.user.id not in {a.id for a in admins}:
        raise forbidden()
    return admins


@router.patch("/{user_id}", response_model=UserOut)
def change_user(user_id: uuid.UUID, body: UserPatch, db: DB, who: Admin):
    """Rename, change role, deactivate or bring back. Nobody deactivates
    themselves, and the last active admin stays one."""
    # every active admin's row is locked first, in one order, so two admins
    # demoting each other at once can't leave nobody in charge
    admins = lock_admins(db, who)
    user = db.execute(select(AppUser).where(AppUser.id == user_id).with_for_update()
                      .execution_options(populate_existing=True)).scalar_one_or_none()
    if user is None:
        raise no_such_user()
    if body.active is False and user.id == who.user.id:
        raise ApiError(409, "own_account", "You can't deactivate yourself. Ask another admin.")
    stops_being_admin = user.role == "admin" and user.active and (
        body.active is False or body.role not in (None, "admin"))
    if stops_being_admin and len(admins) <= 1:
        raise ApiError(409, "last_admin", "Simple Docs needs at least one active admin. "
                                          "Make someone else an admin first.")
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        user.role = body.role
    if body.active is not None and body.active != user.active:
        user.active = body.active
        if not body.active:
            sessions.end_all(db, user)
    db.commit()
    return user_out(user)


class PasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: NewPassword


@router.post("/{user_id}/password", status_code=204)
def set_password(user_id: uuid.UUID, body: PasswordIn, db: DB, who: Admin):
    """A new password from an admin: it clears a lock and signs them out
    everywhere (but this session, if it is your own)."""
    lock_admins(db, who)
    user = db.execute(select(AppUser).where(AppUser.id == user_id).with_for_update()
                      .execution_options(populate_existing=True)).scalar_one_or_none()
    if user is None:
        raise no_such_user()
    user.password_hash = access.hash_password(body.password)
    user.failed_attempts = 0
    user.locked_until = None
    sessions.end_all(db, user, keep=who.session if user.id == who.user.id else None)
    db.commit()
    return Response(status_code=204)
