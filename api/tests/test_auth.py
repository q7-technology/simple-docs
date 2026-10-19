from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, all_at_once, fresh_client, make_user, sign_in
from sqlalchemy import update

from sdocs.models import AppUser, UserSession

WRONG = {"error": {"code": "wrong_password", "message": "Wrong username or password."}}


def _try(client, username: str, password: str):
    return client.post("/v1/auth/sign-in", json={"username": username, "password": password})


def test_signing_in_sets_a_cookie_only_the_browser_can_read(client, editor):
    r = _try(client, " Mel ", PASSWORD)
    assert r.status_code == 200
    assert r.json() == {"id": str(editor.id), "username": "mel", "display_name": "Mel Grant",
                        "role": "editor",
                        "scopes": ["documents:read", "documents:write", "clients:read",
                                   "clients:write", "reviews:write"]}
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("sdocs_session=sdocs_s.")
    lowered = cookie.lower()
    assert "httponly" in lowered and "samesite=strict" in lowered and "path=/" in lowered
    # plain http://localhost by default (DOCS_COOKIE_SECURE)
    assert "; secure" not in lowered
    # the token is in the cookie only, never in what a page's script can read
    assert "sdocs_s." not in r.text


def test_the_cookie_says_who_you_are(client, reviewer):
    sign_in(client, "sam")
    me = client.get("/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Sam Vu" and me.json()["role"] == "reviewer"


def test_no_cookie_is_signed_out(client):
    r = client.get("/v1/auth/me")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "signed_out",
                                  "message": "You're signed out. Sign in again."}}


def test_a_wrong_password_and_an_unknown_username_look_alike(client, editor):
    wrong = _try(client, "mel", "nope")
    unknown = _try(client, "nobody", "nope")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == WRONG


def test_a_deactivated_person_cannot_sign_in(client, db):
    make_user(db, "old", "Old Timer", active=False)
    r = _try(client, "old", PASSWORD)
    assert r.status_code == 401 and r.json() == WRONG


def test_five_wrong_passwords_lock_it_for_15_minutes(client, db, editor):
    for _ in range(4):
        assert _try(client, "mel", "nope").json() == WRONG
    r = _try(client, "mel", "nope")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "locked", "message":
                                  "Too many wrong passwords. Try again in 15 minutes."}}
    assert _try(client, "mel", PASSWORD).json()["error"]["code"] == "locked"
    # 15 minutes on, the right password works and the count starts again
    db.execute(update(AppUser).values(locked_until=datetime.now(UTC) - timedelta(seconds=1)))
    db.commit()
    assert _try(client, "mel", PASSWORD).status_code == 200
    db.refresh(editor)
    assert editor.failed_attempts == 0 and editor.locked_until is None


def test_a_right_password_clears_the_count(client, db, editor):
    _try(client, "mel", "nope")
    sign_in(client, "mel")
    db.refresh(editor)
    assert editor.failed_attempts == 0 and editor.last_sign_in_at is not None


def test_a_hash_with_weaker_settings_is_replaced_at_sign_in(client, db, editor):
    from argon2 import PasswordHasher

    from sdocs.services import access

    editor.password_hash = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    db.commit()
    sign_in(client, "mel")
    db.refresh(editor)
    assert not access.needs_rehash(editor.password_hash)
    assert access.verify_password(PASSWORD, editor.password_hash)


def test_wrong_passwords_sent_all_at_once_still_lock_after_five(client, editor):
    def guess():
        return _try(fresh_client(), "mel", "nope").json()["error"]["code"]

    codes = all_at_once(8, guess)
    assert codes.count("wrong_password") == 4 and codes.count("locked") == 4


def test_signing_out_ends_the_session(client, editor):
    sign_in(client, "mel")
    token = client.cookies["sdocs_session"]
    r = client.post("/v1/auth/sign-out")
    assert r.status_code == 204
    assert "sdocs_session=" in r.headers["set-cookie"] and "max-age=0" in r.headers["set-cookie"].lower()
    assert client.get("/v1/auth/me").status_code == 401
    # the old token is no good either, even if something kept it
    assert client.get("/v1/auth/me", headers={"Cookie": f"sdocs_session={token}"}).status_code == 401
    # again, or with no session at all, is still fine
    assert client.post("/v1/auth/sign-out").status_code == 204


def test_12_hours_without_a_request_signs_you_out(client, db, editor):
    sign_in(client, "mel")
    db.execute(update(UserSession).values(last_seen_at=datetime.now(UTC) - timedelta(hours=12, minutes=1)))
    db.commit()
    assert client.get("/v1/auth/me").json()["error"]["code"] == "signed_out"


def test_a_deactivated_persons_session_stops_working(client, db, editor):
    sign_in(client, "mel")
    db.execute(update(AppUser).values(active=False))
    db.commit()
    assert client.get("/v1/auth/me").status_code == 401


def test_a_scope_is_held_exactly_by_its_area_or_by_everything():
    from sdocs.api.deps import Principal

    def holds(scopes: list[str], scope: str) -> bool:
        return Principal(user=None, session=None, scopes=scopes).has_scope(scope)  # type: ignore[arg-type]

    assert holds(["*"], "users:write")
    assert holds(["documents:*"], "documents:write")
    assert holds(["documents:read"], "documents:read")
    assert not holds(["documents:read"], "documents:write")
    assert not holds(["documents:*"], "clients:read")
    assert not holds([], "documents:read")
