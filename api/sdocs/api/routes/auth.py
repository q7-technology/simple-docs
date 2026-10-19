"""Sign in with a username and password. The session token goes into an
httpOnly, SameSite=Strict cookie and nowhere else: the desktop's scripts
never see it, and a script of your own keeps it in a cookie jar."""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from sdocs.api.deps import COOKIE, DB, Who
from sdocs.api.errors import ApiError
from sdocs.config import get_settings
from sdocs.models import AppUser
from sdocs.services import access, sessions

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("sdocs")

TRIES = 5
LOCK = timedelta(minutes=15)


class SignInIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(max_length=200)
    password: str = Field(max_length=access.MAX_PASSWORD)


class MeOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: str
    scopes: list[str]


def me_out(user: AppUser) -> MeOut:
    return MeOut(id=user.id, username=user.username, display_name=user.display_name,
                 role=user.role, scopes=sessions.scopes_for(user.role))


def wrong_password() -> ApiError:
    return ApiError(401, "wrong_password", "Wrong username or password.")


def locked() -> ApiError:
    return ApiError(401, "locked", "Too many wrong passwords. Try again in 15 minutes.")


def signed_in(db, user: AppUser, response: Response) -> MeOut:
    """A new session for this person, committed, its token set as the cookie."""
    raw = sessions.start(db, user)
    user.last_sign_in_at = datetime.now(UTC)
    db.commit()
    response.set_cookie(COOKIE, raw, max_age=int(sessions.LIFETIME.total_seconds()),
                        path="/", httponly=True, samesite="strict",
                        secure=get_settings().cookie_secure)
    return me_out(user)


@router.post("/sign-in", response_model=MeOut)
def sign_in(body: SignInIn, db: DB, response: Response,
            token: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    """Five wrong passwords lock the password for 15 minutes. Signing in ends
    the session this browser had, so a replaced cookie leaves nothing live."""
    # the row stays locked until this attempt is counted, so guesses sent all
    # at once are weighed one after another and cannot get past the limit
    user = db.execute(select(AppUser).where(AppUser.username == body.username.strip().lower())
                      .with_for_update()).scalar_one_or_none()
    now = datetime.now(UTC)
    if user is None or not user.active:
        # an unknown username and a wrong password look alike, and take as long
        access.verify_password(body.password, access.DUMMY_HASH)
        raise wrong_password()
    if user.locked_until is not None and user.locked_until > now:
        # as long as a real attempt, so the reply's timing says no more than its code
        access.verify_password(body.password, access.DUMMY_HASH)
        raise locked()
    if not access.verify_password(body.password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= TRIES:
            user.failed_attempts = 0
            user.locked_until = now + LOCK
            db.commit()
            log.info("sign-in locked for %s", user.username)
            raise locked()
        db.commit()
        # no tries-left count: an unknown username could not say it without giving itself away
        raise wrong_password()
    if access.needs_rehash(user.password_hash):
        # made with weaker argon2 settings than today's: replace it while we have the password
        user.password_hash = access.hash_password(body.password)
    user.failed_attempts = 0
    user.locked_until = None
    if token:
        sessions.end(db, token)
    return signed_in(db, user, response)


@router.post("/sign-out", status_code=204)
def sign_out(db: DB, token: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    """Ends this session and clears the cookie. A 204 even with no session."""
    if token:
        sessions.end(db, token)
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="strict",
                           secure=get_settings().cookie_secure)
    return response


@router.get("/me", response_model=MeOut)
def me(who: Who):
    return me_out(who.user)
