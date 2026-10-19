from conftest import all_at_once, fresh_client
from sqlalchemy import func, select

from sdocs.models import AppUser, Setting

FIRST = {"org_name": " Acme  Pty Ltd ", "display_name": "Leighton Lauton",
         "username": "Leighton", "password": "correct horse battery"}


def test_a_fresh_install_asks_for_its_first_admin(client):
    assert client.get("/v1/branding").json() == {"setup_needed": True, "org_name": None,
                                                 "logo_id": None}


def test_first_run_makes_the_admin_names_the_organisation_and_signs_in(client, db):
    r = client.post("/v1/setup", json=FIRST)
    assert r.status_code == 201
    assert r.json()["username"] == "leighton" and r.json()["role"] == "admin"
    assert r.json()["scopes"] == ["*"]
    assert "sdocs_session=sdocs_s." in r.headers["set-cookie"]
    assert client.get("/v1/auth/me").json()["display_name"] == "Leighton Lauton"
    assert client.get("/v1/branding").json() == {"setup_needed": False,
                                                 "org_name": "Acme Pty Ltd", "logo_id": None}
    admin = db.execute(select(AppUser)).scalar_one()
    assert admin.created_by is None
    name = db.execute(select(Setting).where(Setting.key == "org.name")).scalar_one()
    assert name.value == "Acme Pty Ltd" and name.created_by == admin.id


def test_first_run_is_refused_once_anyone_exists(client, db, editor):
    r = client.post("/v1/setup", json=FIRST)
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "already_set_up",
                                  "message": "Simple Docs is already set up. Sign in instead."}}
    assert db.execute(select(func.count()).select_from(AppUser)).scalar() == 1


def test_two_first_runs_at_once_make_one_admin(client, db):
    def go():
        return fresh_client().post("/v1/setup", json=FIRST).status_code

    assert sorted(all_at_once(4, go)) == [201, 409, 409, 409]
    assert db.execute(select(func.count()).select_from(AppUser)).scalar() == 1


def test_first_run_checks_what_it_is_given(client):
    r = client.post("/v1/setup", json={"org_name": " ", "display_name": "Leighton",
                                       "username": "a b", "password": "short"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {
        "org_name": "Can't be blank.",
        "username": "Use 2 to 64 letters, numbers, dots, dashes or underscores, "
                    "starting with a letter or number.",
        "password": "Use at least 12 characters.",
    }
    assert client.get("/v1/branding").json()["setup_needed"] is True


def test_an_install_whose_only_person_is_deactivated_stays_set_up(client, db, editor):
    editor.active = False
    db.commit()
    assert client.get("/v1/branding").json()["setup_needed"] is False
    assert client.post("/v1/setup", json=FIRST).status_code == 409


def test_control_characters_are_refused_not_a_500(client):
    r = client.post("/v1/setup", json={**FIRST, "org_name": "A\u0000B"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {
        "org_name": "Use letters, numbers and punctuation only."}
    assert client.get("/v1/branding").json()["setup_needed"] is True
