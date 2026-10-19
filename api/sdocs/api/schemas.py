"""Checks more than one route shares, each with a message written for people."""
from __future__ import annotations

import re
import unicodedata
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


# zero-width non-joiner and joiner
JOINERS = frozenset("\u200c\u200d")


def no_control_chars(value: str) -> str:
    """Refuses control characters (NUL and the like), which PostgreSQL can't
    store and nobody types, and invisible format characters (zero-width
    spaces, direction overrides), which make text read other than it is. The
    zero-width non-joiner and joiner stay: Persian, Indic and other scripts
    need them in real names. Run it after spaces are tidied: tabs and newlines
    are control characters too."""
    if any(unicodedata.category(c) == "Cc"
           or (unicodedata.category(c) == "Cf" and c not in JOINERS) for c in value):
        raise ValueError("Use letters, numbers and punctuation only.")
    return value


def plain_name(value: str) -> str:
    """Spaces tidied; never blank; no control characters."""
    value = " ".join(value.split())
    if not value:
        raise ValueError("Can't be blank.")
    return no_control_chars(value)


Username = Annotated[str, Field(max_length=200), AfterValidator(normal_username)]
NewPassword = Annotated[str, Field(max_length=access.MAX_PASSWORD), AfterValidator(new_password)]
Name = Annotated[str, Field(max_length=120), AfterValidator(plain_name)]
Role = Literal["admin", "editor", "reviewer"]
