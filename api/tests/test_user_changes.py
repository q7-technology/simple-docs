import time
from concurrent.futures import ThreadPoolExecutor

from conftest import fresh_client, make_user, sign_in, signed_in_client
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from sdocs.models import AppUser

LAST = {"error": {"code": "last_admin", "message":
                  "Simple Docs needs at least one active admin. Make someone else an admin first."}}


def _patch(c, user, **change):
    return c.patch(f"/v1/users/{user.id}", json=change)


def test_an_admin_renames_someone_and_changes_their_role(admin_client, editor):
    r = _patch(admin_client, editor, display_name="  Melissa   Grant ", role="reviewer")
    assert r.status_code == 200
    assert (r.json()["display_name"], r.json()["role"]) == ("Melissa Grant", "reviewer")


def test_a_new_role_counts_from_the_next_request(admin_client, editor, editor_client):
    _patch(admin_client, editor, role="admin")
    assert editor_client.get("/v1/auth/me").json()["scopes"] == ["*"]


def test_deactivating_someone_signs_them_out_and_keeps_their_row(admin_client, db, editor,
                                                                 editor_client):
    r = _patch(admin_client, editor, active=False)
    assert r.status_code == 200 and r.json()["active"] is False
    assert editor_client.get("/v1/auth/me").status_code == 401
    assert db.execute(select(AppUser.active).where(AppUser.id == editor.id)).scalar_one() is False


def test_someone_deactivated_can_be_brought_back(admin_client, editor):
    _patch(admin_client, editor, active=False)
    assert _patch(admin_client, editor, active=True).json()["active"] is True
    assert sign_in(fresh_client(), "mel")["username"] == "mel"


def test_nobody_deactivates_themselves(admin_client, admin):
    r = _patch(admin_client, admin, active=False)
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "own_account",
                                  "message": "You can't deactivate yourself. Ask another admin."}}


def test_the_last_active_admin_stays_an_admin(admin_client, db, admin):
    make_user(db, "gone", "Gone Admin", "admin", active=False)  # doesn't count
    r = _patch(admin_client, admin, role="editor")
    assert r.status_code == 409 and r.json() == LAST


def test_with_another_admin_one_can_step_down(admin_client, db, admin):
    make_user(db, "ada", "Ada Ng", "admin")
    assert _patch(admin_client, admin, role="editor").json()["role"] == "editor"


def _waiting_on_a_lock(engine) -> int:
    # a connection of its own: pg_stat_activity is read once per transaction
    with engine.connect() as conn:
        return conn.execute(text("select count(*) from pg_stat_activity where datname = "
                           "current_database() and wait_event_type = 'Lock'")).scalar_one()


def test_two_admins_demoting_each_other_at_once_leave_one(db, engine, admin):
    ada = make_user(db, "ada", "Ada Ng", "admin")
    mine, hers = signed_in_client(admin), signed_in_client(ada)
    with ThreadPoolExecutor(max_workers=2) as pool, Session(engine) as holder:
        # both requests get past their checks of who is asking, then wait here
        # with neither having changed anything yet
        holder.execute(select(AppUser).where(AppUser.role == "admin").with_for_update())
        calls = [pool.submit(lambda: _patch(mine, ada, role="editor").status_code),
                 pool.submit(lambda: _patch(hers, admin, role="editor").status_code)]
        for _ in range(100):
            if _waiting_on_a_lock(engine) >= 2:
                break
            time.sleep(0.05)
        assert _waiting_on_a_lock(engine) >= 2
        holder.rollback()
        codes = sorted(f.result() for f in calls)
    # the loser is refused as the last admin
    assert codes == [200, 409]
    admins = db.execute(select(func.count()).select_from(AppUser)
                        .where(AppUser.role == "admin", AppUser.active.is_(True))).scalar()
    assert admins == 1


def test_people_are_never_deleted(admin_client, db, editor):
    r = admin_client.delete(f"/v1/users/{editor.id}")
    assert r.status_code == 405 and r.json()["error"]["code"] == "method_not_allowed"
    assert db.execute(select(AppUser.id).where(AppUser.id == editor.id)).scalar_one() == editor.id


def test_an_unknown_or_malformed_id(admin_client):
    r = admin_client.patch("/v1/users/00000000-0000-0000-0000-000000000000", json={"role": "editor"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    assert admin_client.patch("/v1/users/kim", json={"role": "editor"}).status_code == 422


def test_only_an_admin_changes_anyone(editor_client, reviewer):
    assert _patch(editor_client, reviewer, role="admin").status_code == 403
