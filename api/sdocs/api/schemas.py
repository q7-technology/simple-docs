"""Checks more than one route shares, each with a message written for people."""
from __future__ import annotations

import re
from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from sdocs.services import access

USERNAME = re.compile(r"[a-z0-9][a-z0-9._-]{1,63}")
USERNAME_RULE = ("Use 2 to 64 letters, numbers, dots, dashes or underscores, "
                 "starting with a letter or number.")


def normal_username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME.fullmatch(value):
        raise ValueError(USERNAME_RULE)
    return value


def new_password(value: str) -> str:
    if len(value) < access.MIN_PASSWORD:
        raise ValueError(f"Use at least {access.MIN_PASSWORD} characters.")
    return value


def plain_name(value: str) -> str:
    """Spaces tidied; never blank."""
    value = " ".join(value.split())
    if not value:
        raise ValueError("Can't be blank.")
    return value


Username = Annotated[str, Field(max_length=200), AfterValidator(normal_username)]
NewPassword = Annotated[str, Field(max_length=access.MAX_PASSWORD), AfterValidator(new_password)]
Name = Annotated[str, Field(max_length=120), AfterValidator(plain_name)]
Role = Literal["admin", "editor", "reviewer"]
