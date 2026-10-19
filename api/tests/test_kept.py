"""block_change() keeps rows as they are. Step 2's document_version uses it
for UPDATE and DELETE (append-only); app_user uses it for DELETE now, because
people are deactivated, never deleted (rule 1)."""
import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import DBAPIError

from sdocs.models import ROLES, AppUser, UserSession


def _scratch(db):
    """A throwaway table guarded the way an append-only table will be."""
    db.execute(text("create temp table scratch (n int)"))
    db.execute(text("create trigger scratch_kept before update or delete on scratch "
                    "for each row execute function block_change()"))
    db.execute(text("insert into scratch values (1)"))


def test_an_update_is_refused(db):
    _scratch(db)
    with pytest.raises(DBAPIError, match="UPDATE on scratch is not allowed"):
        db.execute(text("update scratch set n = 2"))


def test_a_delete_is_refused(db):
    _scratch(db)
    with pytest.raises(DBAPIError, match="DELETE on scratch is not allowed"):
        db.execute(text("delete from scratch"))


def test_truncate_still_clears_a_table_for_the_tests(db):
    _scratch(db)
    db.execute(text("truncate scratch"))
    assert db.execute(text("select count(*) from scratch")).scalar() == 0


def test_a_person_is_deactivated_never_deleted(db):
    db.add(AppUser(username="kim", password_hash="x", display_name="Kim Lee", role="editor"))
    db.commit()
    with pytest.raises(DBAPIError, match="DELETE on app_user is not allowed"):
        db.execute(delete(AppUser))
    db.rollback()
    db.execute(update(AppUser).values(active=False))
    db.commit()
    assert db.execute(select(AppUser.active)).scalar_one() is False


def test_the_database_keeps_usernames_lower_case_and_roles_known(db):
    with pytest.raises(DBAPIError, match="ck_app_user_username_lower"):
        db.add(AppUser(username="Kim", password_hash="x", display_name="Kim", role="editor"))
        db.flush()
    db.rollback()
    with pytest.raises(DBAPIError, match="ck_app_user_role"):
        db.add(AppUser(username="kim", password_hash="x", display_name="Kim", role="owner"))
        db.flush()


def test_the_roles_the_code_knows_are_the_roles_the_database_allows(db):
    check = db.execute(text("select pg_get_constraintdef(oid) from pg_constraint "
                            "where conname = 'ck_app_user_role'")).scalar_one()
    assert set(re.findall(r"'(\w+)'", check)) == set(ROLES)


def test_a_person_added_by_hand_is_active_with_no_failed_attempts(db):
    row = db.execute(text("insert into app_user (username, password_hash, display_name, role) "
                          "values ('kim', 'x', 'Kim', 'editor') "
                          "returning active, failed_attempts")).one()
    assert (row.active, row.failed_attempts) == (True, 0)


def test_a_session_keeps_a_whole_sha256(db):
    kim = AppUser(username="kim", password_hash="x", display_name="Kim", role="editor")
    db.add(kim)
    db.flush()
    now = datetime.now(UTC)
    with pytest.raises(DBAPIError, match="ck_session_token_hash_sha256"):
        db.add(UserSession(created_by=kim.id, token_hash="abc", last_seen_at=now, expires_at=now))
        db.flush()
