"""skeleton: people, sessions, settings, the logo, and block_change()

Revision ID: 0001
Revises:
Create Date: 2026-10-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"),
                     nullable=False)


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                     nullable=False)


def upgrade() -> None:
    op.create_table(
        "app_user",
        _id(),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint("username = lower(username)", name=op.f("ck_app_user_username_lower")),
        sa.CheckConstraint("role in ('admin', 'editor', 'reviewer')",
                           name=op.f("ck_app_user_role")),
        sa.CheckConstraint("failed_attempts >= 0", name=op.f("ck_app_user_failed_attempts")),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_app_user_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_user")),
        sa.UniqueConstraint("username", name=op.f("uq_app_user_username")),
    )
    op.create_table(
        "session",
        _id(),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_session_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_session")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_session_token_hash")),
    )
    op.create_index(op.f("ix_session_created_by"), "session", ["created_by"])
    op.create_table(
        "setting",
        _id(),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_setting_created_by_app_user")),
        sa.ForeignKeyConstraint(["updated_by"], ["app_user.id"],
                                name=op.f("fk_setting_updated_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_setting")),
        sa.UniqueConstraint("key", name=op.f("uq_setting_key")),
    )
    op.create_table(
        "org_logo",
        _id(),
        sa.Column("mime", sa.String(length=32), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.CheckConstraint("mime in ('image/png', 'image/jpeg')", name=op.f("ck_org_logo_mime")),
        sa.CheckConstraint("octet_length(content) <= 524288", name=op.f("ck_org_logo_size")),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_org_logo_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_logo")),
    )

    # Rows that are kept as they are. One function for every such table:
    # step 2's document_version refuses UPDATE and DELETE (append-only);
    # app_user refuses DELETE (people are deactivated, never deleted).
    # TRUNCATE is neither, so the tests can still clear the tables.
    op.execute("""
        create or replace function block_change() returns trigger
        language plpgsql as $$
        begin
            raise exception '% on % is not allowed: rows here are kept as they are',
                tg_op, tg_table_name
                using errcode = 'restrict_violation';
        end
        $$
    """)
    op.execute("create trigger app_user_never_deleted before delete on app_user "
               "for each row execute function block_change()")


def downgrade() -> None:
    op.execute("drop trigger if exists app_user_never_deleted on app_user")
    op.execute("drop function if exists block_change()")
    op.drop_table("org_logo")
    op.drop_table("setting")
    op.drop_index(op.f("ix_session_created_by"), table_name="session")
    op.drop_table("session")
    op.drop_table("app_user")
