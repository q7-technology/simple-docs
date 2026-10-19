"""What the sign-in and first-run pages need before anyone signs in, and the
first run itself: the first admin and the organisation's name. Once anyone
exists, first run is refused for good; the way back in after that is
`sdocs set-password`."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.orm import Session as Db

from sdocs.api.deps import DB
from sdocs.api.errors import ApiError, not_found
from sdocs.api.routes.auth import MeOut, signed_in
from sdocs.api.schemas import Name, NewPassword, Username
from sdocs.models import AppUser, OrgLogo
from sdocs.services import access, settings

router = APIRouter(tags=["setup"])


class BrandingOut(BaseModel):
    setup_needed: bool
    org_name: str | None
    # the logo in use (GET /v1/branding/logo); its id changes with each upload
    logo_id: str | None


def anyone(db: Db) -> bool:
    return db.execute(select(AppUser.id).limit(1)).first() is not None


@router.get("/branding", response_model=BrandingOut)
def branding(db: DB):
    """Whether first run is needed, and the organisation's name and logo.
    Needs no session: the sign-in page shows them."""
    org = settings.read(db, (settings.ORG_NAME, settings.ORG_LOGO))
    return BrandingOut(setup_needed=not anyone(db), org_name=org[settings.ORG_NAME],
                       logo_id=org[settings.ORG_LOGO])


class SetupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    org_name: Name
    display_name: Name
    username: Username
    password: NewPassword


@router.post("/setup", status_code=201, response_model=MeOut)
def setup(body: SetupIn, db: DB, response: Response):
    # one first run at a time: another, sent at the same moment, waits here
    # until this one commits, then finds the admin it made
    db.execute(text("select pg_advisory_xact_lock(hashtext('sdocs.setup'))"))
    if anyone(db):
        raise ApiError(409, "already_set_up", "Simple Docs is already set up. Sign in instead.")
    admin = AppUser(username=body.username, display_name=body.display_name, role="admin",
                    password_hash=access.hash_password(body.password), active=True,
                    failed_attempts=0)
    db.add(admin)
    db.flush()
    settings.write(db, {settings.ORG_NAME: body.org_name}, admin)
    return signed_in(db, admin, response)


@router.get("/branding/logo")
def logo(db: DB):
    """The organisation's logo. Needs no session: the sign-in page shows it."""
    logo_id = settings.read(db, (settings.ORG_LOGO,))[settings.ORG_LOGO]
    row = db.get(OrgLogo, uuid.UUID(logo_id)) if logo_id else None
    if row is None:
        raise not_found("There's no logo. Simple Docs shows its own mark instead.")
    return Response(row.content, media_type=row.mime, headers={
        # the address stays the same across uploads; the page asks each time
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
    })
