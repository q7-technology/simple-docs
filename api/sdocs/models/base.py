import uuid

from sqlalchemy import DateTime, MetaData, Uuid, func, text
from sqlalchemy.orm import DeclarativeBase, mapped_column

naming = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=naming)


def uuid_pk():
    """Every table's id: a uuid, made by Python or, for a row written by
    hand, by Postgres."""
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4,
                         server_default=text("gen_random_uuid()"))


def created_at_column():
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
