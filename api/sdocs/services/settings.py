"""Settings kept in the database (`setting` rows) and changed in the app.
Step 1 has the organisation's details; later steps add their own keys
(models, budget, caps, ignore and redaction patterns, connectors)."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session as Db

from sdocs.models import AppUser, Setting

ORG_NAME = "org.name"
ORG_LOGO = "org.logo"
ORG_KEYS = (ORG_NAME, "org.abn", "org.phone", "org.email", "org.address", ORG_LOGO)


def read(db: Db, keys: Iterable[str]) -> dict[str, Any]:
    """Each key's value, or None where nothing is set."""
    keys = tuple(keys)
    found: dict[str, Any] = {key: value for key, value in db.execute(
        select(Setting.key, Setting.value).where(Setting.key.in_(keys)))}
    return {key: found.get(key) for key in keys}


def write(db: Db, values: dict[str, Any], by: AppUser | None) -> None:
    """Set each key (None clears it), noting who. Not committed. Keys are
    defined in code, never taken from what a request sends."""
    who = by.id if by is not None else None
    for key, value in values.items():
        stmt = insert(Setting).values(key=key, value=value, created_by=who, updated_by=who)
        db.execute(stmt.on_conflict_do_update(
            index_elements=[Setting.key],
            set_={"value": stmt.excluded.value, "updated_by": who, "updated_at": func.now()}))
    db.flush()
