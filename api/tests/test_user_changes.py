import time
from concurrent.futures import ThreadPoolExecutor

from conftest import fresh_client, make_user, sign_in, signed_in_client
from sqlalchemy import func, select, text, update
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


def _blocked_by(engine, pid: int) -> int:
    """How many backends wait, directly or behind another waiter, on a lock
    the backend `pid` holds (the second waiter on a row queues behind the
    first)."""
    # a connection of its own: pg_stat_activity is read once per transaction
    with engine.connect() as conn:
        return conn.execute(text(
            "with recursive blocked(pid) as ("
            " select pid from pg_stat_activity where :pid = any(pg_blocking_pids(pid))"
            " union select a.pid from pg_stat_activity a"
            " join blocked b on b.pid = any(pg_blocking_pids(a.pid)))"
            " select count(*) from blocked"), {"pid": pid}).scalar_one()


def _wait_until_blocked(engine, pid: int, n: int) -> int:
    seen = 0
    for _ in range(200):
        seen = _blocked_by(engine, pid)
        if seen >= n:
            break
        time.sleep(0.05)
    return seen


def _hold_the_admins(holder) -> int:
    """Lock every admin row in `holder`; its backend's pid."""
    holder.execute(select(AppUser).where(AppUser.role == "admin").with_for_update())
    return holder.execute(text("select pg_backend_pid()")).scalar_one()


def test_two_admins_demoting_each_other_at_once_leave_one(db, engine, admin):
    ada = make_user(db, "ada", "Ada Ng", "admin")
    mine, hers = signed_in_client(admin), signed_in_client(ada)
    with ThreadPoolExecutor(max_workers=2) as pool, Session(engine) as holder:
        # both requests get past their checks of who is asking, then wait here
        # with neither having changed anything yet
        pid = _hold_the_admins(holder)
        calls = [pool.submit(lambda: _patch(mine, ada, role="editor").status_code),
                 pool.submit(lambda: _patch(hers, admin, role="editor").status_code)]
        assert _wait_until_blocked(engine, pid, 2) == 2
        holder.rollback()
        codes = sorted(f.result(timeout=10) for f in calls)
    # the winner demoted the loser, who is refused as no longer an admin
    assert codes == [200, 403]
    admins = db.execute(select(func.count()).select_from(AppUser)
                        .where(AppUser.role == "admin", AppUser.active.is_(True))).scalar()
    assert admins == 1


def test_an_admin_demoted_while_their_change_waits_is_refused(db, engine, admin, editor):
    ada = make_user(db, "ada", "Ada Ng", "admin")
    hers = signed_in_client(ada)
    with ThreadPoolExecutor(max_workers=1) as pool, Session(engine) as holder:
        pid = _hold_the_admins(holder)
        call = pool.submit(lambda: _patch(hers, editor, role="admin"))
        assert _wait_until_blocked(engine, pid, 1) == 1
        # demoted by someone else after her session was checked
        holder.execute(update(AppUser).where(AppUser.id == ada.id).values(role="editor"))
        holder.commit()
        r = call.result(timeout=10)
    assert r.status_code == 403 and r.json()["error"]["code"] == "forbidden"
    assert db.execute(select(AppUser.role).where(AppUser.id == editor.id)).scalar_one() == "editor"


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
