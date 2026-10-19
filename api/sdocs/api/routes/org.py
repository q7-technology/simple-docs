"""Settings → Organisation: the details documents carry ({{org.*}} in
templates, from step 2) and the logo. Everyone signed in reads them; an
admin changes them. Each is a `setting` row: org.name, org.abn, org.phone,
org.email, org.address and org.logo."""
from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from sdocs.api.deps import DB, Principal, Who, require
from sdocs.api.schemas import Name, no_control_chars
from sdocs.services import settings

router = APIRouter(prefix="/settings/org", tags=["settings"])

Admin = Annotated[Principal, require("settings:write")]

FIELDS = ("name", "abn", "phone", "email", "address")
ABN_WEIGHTS = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
DIGITS = "0123456789"
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


class OrgOut(BaseModel):
    name: str | None
    abn: str | None
    phone: str | None
    email: str | None
    address: str | None
    logo_id: str | None


def org_out(db) -> OrgOut:
    values = settings.read(db, settings.ORG_KEYS)
    return OrgOut(**{f: values[f"org.{f}"] for f in FIELDS}, logo_id=values[settings.ORG_LOGO])


def normal_abn(value: str) -> str:
    """11 digits that pass the ATO's check, written 51 824 753 556."""
    digits = "".join(c for c in value if c in DIGITS)
    if len(digits) != 11 or any(c not in DIGITS + " " for c in value):
        raise ValueError("An ABN is 11 digits, e.g. 51 824 753 556.")
    weighted = [int(d) for d in digits]
    weighted[0] -= 1
    if sum(d * w for d, w in zip(weighted, ABN_WEIGHTS, strict=True)) % 89:
        raise ValueError("That isn't a valid ABN. Check the 11 digits.")
    return f"{digits[:2]} {digits[2:5]} {digits[5:8]} {digits[8:]}"


class OrgIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    abn: str | None = Field(default=None, max_length=20)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=254)
    address: str | None = Field(default=None, max_length=300)

    # runs before the checks below (pydantic runs a field's validators in order)
    @field_validator("abn", "phone", "email", "address")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        """Spaces tidied on each line, blank lines dropped, control characters
        refused; blank is None."""
        if value is None:
            return None
        lines = (" ".join(line.split()) for line in value.splitlines())
        return "\n".join(no_control_chars(line) for line in lines if line) or None

    @field_validator("abn")
    @classmethod
    def _abn(cls, value: str | None) -> str | None:
        return None if value is None else normal_abn(value)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not EMAIL.fullmatch(value):
            raise ValueError("That doesn't look like an email address.")
        return value.lower()


@router.get("", response_model=OrgOut)
def get_org(db: DB, who: Who):
    return org_out(db)


@router.put("", response_model=OrgOut)
def put_org(body: OrgIn, db: DB, who: Admin):
    settings.write(db, {f"org.{f}": getattr(body, f) for f in FIELDS}, who.user)
    db.commit()
    return org_out(db)
