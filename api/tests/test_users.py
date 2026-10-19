from conftest import fresh_client, make_user, sign_in
from sqlalchemy import select

from sdocs.models import AppUser

KIM = {"username": "Kim", "display_name": "Kim Lee", "role": "reviewer",
       "password": "another long password"}
FORBIDDEN = {"error": {"code": "forbidden", "message": "Your role can't do that. Ask an admin."}}


def test_an_admin_sees_everyone_active_first_by_name(admin_client, db, admin, editor):
    make_user(db, "old", "Old Timer", "reviewer", active=False)
    make_user(db, "ada", "Ada Ng", "editor")
    items = admin_client.get("/v1/users").json()["items"]
    assert [u["username"] for u in items] == ["ada", "leighton", "mel", "old"]
    assert items[-1]["active"] is False
    assert set(items[0]) == {"id", "username", "display_name", "role", "active", "locked",
                             "last_sign_in_at", "created_at"}


def test_only_an_admin_sees_or_adds_users(editor_client, reviewer_client, client):
    for c in (editor_client, reviewer_client):
        r = c.get("/v1/users")
        assert r.status_code == 403 and r.json() == FORBIDDEN
        assert c.post("/v1/users", json=KIM).status_code == 403
    assert client.get("/v1/users").status_code == 401


def test_an_admin_adds_someone_who_can_then_sign_in(admin_client, db, admin):
    r = admin_client.post("/v1/users", json=KIM)
    assert r.status_code == 201
    out = r.json()
    assert (out["username"], out["display_name"], out["role"], out["active"], out["locked"]) == (
        "kim", "Kim Lee", "reviewer", True, False)
    assert "another long password" not in r.text
    kim = db.execute(select(AppUser).where(AppUser.username == "kim")).scalar_one()
    assert kim.created_by == admin.id and kim.password_hash.startswith("$argon2id$")
    assert sign_in(fresh_client(), "kim", "another long password")["role"] == "reviewer"


def test_a_username_is_taken_whatever_its_case(admin_client, editor):
    r = admin_client.post("/v1/users", json={**KIM, "username": "MEL"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"username": "That username is taken."}


def test_a_username_taken_at_the_same_moment_is_still_taken(admin_client, beaten_to_it):
    beaten_to_it(AppUser(username="kim", display_name="Kim Other", role="editor",
                         password_hash="x"), "username")
    r = admin_client.post("/v1/users", json=KIM)
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"username": "That username is taken."}


def test_a_new_user_needs_a_known_role_and_a_long_password(admin_client):
    r = admin_client.post("/v1/users", json={**KIM, "role": "owner", "password": "short"})
    assert r.status_code == 422
    fields = r.json()["error"]["fields"]
    assert set(fields) == {"role", "password"}
    assert fields["password"] == "Use at least 12 characters."
