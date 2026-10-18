from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from sdocs.models.base import Base, created_at_column, uuid_pk


class Setting(Base):
    """A setting changed in the app: a key and a JSON value, changed in
    place (configuration, not history). Step 1's keys are the organisation's
    details: org.name, org.abn, org.phone, org.email, org.address, and
    org.logo (the id of the org_logo row in use)."""

    __tablename__ = "setting"

    id: Mapped[uuid.UUID] = uuid_pk()
    key: Mapped[str] = mapped_column(String(64), unique=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = created_at_column()
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                 server_default=func.now())
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))


class OrgLogo(Base):
    """The organisation's logo, in the database (bytea) so one pg_dump is a
    whole backup. An upload is a new row; setting org.logo names the one in
    use. PNG or JPEG, 512 KB at most."""

    __tablename__ = "org_logo"
    __table_args__ = (
        CheckConstraint("mime in ('image/png', 'image/jpeg')", name="mime"),
        CheckConstraint("octet_length(content) <= 524288", name="size"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    mime: Mapped[str] = mapped_column(String(32))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = created_at_column()
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
