"""Settings → Organisation: the details documents carry ({{org.*}} in
templates, from step 2) and the logo. Everyone signed in reads them; an
admin changes them. Each is a `setting` row: org.name, org.abn, org.phone,
org.email, org.address and org.logo."""
from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator

from sdocs.api.deps import DB, Principal, Who, require
from sdocs.api.errors import ApiError, invalid
from sdocs.api.schemas import Name, no_control_chars
from sdocs.models import OrgLogo
from sdocs.services import settings

router = APIRouter(prefix="/settings/org", tags=["settings"])

Admin = Annotated[Principal, require("settings:write")]

FIELDS = ("name", "abn", "phone", "email", "address")
ABN_WEIGHTS = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
DIGITS = "0123456789"
ABN_SEPARATORS = " -."
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
    if len(digits) != 11 or any(c not in DIGITS + ABN_SEPARATORS for c in value):
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

    # these two run before the checks below (pydantic runs a field's
    # validators in order)
    @field_validator("abn", "phone", "email")
    @classmethod
    def _one_line(cls, value: str | None) -> str | None:
        """One line: spaces (newlines too) tidied to single spaces, control
        characters refused; blank is None."""
        if value is None:
            return None
        return no_control_chars(" ".join(value.split())) or None

    @field_validator("address")
    @classmethod
    def _lines(cls, value: str | None) -> str | None:
        """Lines split at newlines only (CR LF and CR count as one), spaces
        tidied within each, blank lines dropped, control characters refused;
        blank is None."""
        if value is None:
            return None
        lines = value.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        tidied = (" ".join(line.split()) for line in lines)
        return "\n".join(no_control_chars(line) for line in tidied if line) or None

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


MAX_LOGO = 512 * 1024
# what each kind's bytes start with: the header alone is only a claim
SIGNATURES = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}


BINARY = {"schema": {"type": "string", "format": "binary"}}


def _too_large() -> ApiError:
    return ApiError(413, "too_large", "The logo can be 512 KB at most.")


async def logo_body(request: Request) -> bytes:
    """The request's body, read only while it can still be a logo: a
    Content-Length over the limit is refused before a byte is read, and a
    body that runs past the limit (whatever it said) as soon as it does."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_LOGO:
        raise _too_large()
    content = bytearray()
    async for chunk in request.stream():
        content += chunk
        if len(content) > MAX_LOGO:
            raise _too_large()
    return bytes(content)


@router.put("/logo", status_code=204, openapi_extra={"requestBody": {
    "required": True, "content": {mime: BINARY for mime in SIGNATURES}}})
def put_logo(db: DB, who: Admin, content: Annotated[bytes, Depends(logo_body)],
             content_type: Annotated[str | None, Header()] = None):
    """The logo is the request's body, sent as image/png or image/jpeg. SVG
    is refused: it can carry script."""
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in SIGNATURES:
        raise ApiError(415, "unsupported_type", "Use a PNG or JPEG for the logo.")
    if not content.startswith(SIGNATURES[mime]):
        raise invalid("logo", "That file isn't the PNG or JPEG it says it is.")
    logo = OrgLogo(mime=mime, content=content, created_by=who.user.id)
    db.add(logo)
    db.flush()
    settings.write(db, {settings.ORG_LOGO: str(logo.id)}, who.user)
    db.commit()
    return Response(status_code=204)


@router.delete("/logo", status_code=204)
def remove_logo(db: DB, who: Admin):
    """Back to the Simple Docs mark. The old logo's row stays."""
    settings.write(db, {settings.ORG_LOGO: None}, who.user)
    db.commit()
    return Response(status_code=204)
