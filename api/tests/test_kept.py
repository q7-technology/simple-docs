"""block_change() keeps rows as they are. Step 2's document_version uses it
for UPDATE and DELETE (append-only); app_user uses it for DELETE now, because
people are deactivated, never deleted (rule 1)."""
import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import DBAPIError

from sdocs.models import AppUser


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
