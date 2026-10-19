from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session as Db

from sdocs.api.errors import ApiError, forbidden
from sdocs.db import get_sessionmaker
from sdocs.models import AppUser, UserSession
from sdocs.services import sessions

COOKIE = "sdocs_session"


def get_db():
    with get_sessionmaker()() as session:
        yield session


DB = Annotated[Db, Depends(get_db)]


@dataclass(slots=True)
class Principal:
    """Whoever is calling: a person with a live session."""

    user: AppUser
    session: UserSession
    scopes: list[str]

    def has_scope(self, scope: str) -> bool:
        area = scope.split(":")[0]
        return "*" in self.scopes or scope in self.scopes or f"{area}:*" in self.scopes


def signed_out() -> ApiError:
    return ApiError(401, "signed_out", "You're signed out. Sign in again.")


def get_principal(db: DB,
                  token: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> Principal:
    row = sessions.find(db, token) if token else None
    user = db.get(AppUser, row.created_by) if row else None
    if row is None or user is None or not user.active:
        raise signed_out()
    db.commit()  # keeps the touch on last_seen_at
    return Principal(user=user, session=row, scopes=sessions.scopes_for(user.role))


Who = Annotated[Principal, Depends(get_principal)]


def require(scope: str):
    """Dependency: the caller must carry this scope. Use it as
    `who: Annotated[Principal, require("users:write")]`."""

    def _check(who: Who) -> Principal:
        if not who.has_scope(scope):
            raise forbidden()
        return who

    return Depends(_check)
