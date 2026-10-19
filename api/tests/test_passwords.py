from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, fresh_client, sign_in, signed_in_client

NEW = "a brand new password"


def test_an_admin_sets_a_password_which_signs_them_out_and_clears_a_lock(admin_client, db,
                                                                        editor, editor_client):
    editor.locked_until = datetime.now(UTC) + timedelta(minutes=10)
    editor.failed_attempts = 3
    db.commit()
    r = admin_client.post(f"/v1/users/{editor.id}/password", json={"password": NEW})
    assert r.status_code == 204
    assert editor_client.get("/v1/auth/me").status_code == 401
    assert sign_in(fresh_client(), "mel", NEW)["username"] == "mel"
    db.refresh(editor)
    assert editor.failed_attempts == 0 and editor.locked_until is None


def test_an_admin_setting_their_own_keeps_this_session(admin_client, admin):
    elsewhere = signed_in_client(admin)
    assert admin_client.post(f"/v1/users/{admin.id}/password",
                             json={"password": NEW}).status_code == 204
    assert admin_client.get("/v1/auth/me").status_code == 200
    assert elsewhere.get("/v1/auth/me").status_code == 401


def test_only_an_admin_sets_someone_elses(editor_client, reviewer):
    r = editor_client.post(f"/v1/users/{reviewer.id}/password", json={"password": NEW})
    assert r.status_code == 403


def test_a_set_password_needs_12_characters(admin_client, editor):
    r = admin_client.post(f"/v1/users/{editor.id}/password", json={"password": "short"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"password": "Use at least 12 characters."}


def test_you_change_your_own_with_the_current_one(editor_client, editor):
    elsewhere = signed_in_client(editor)
    r = editor_client.post("/v1/auth/password",
                           json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 204
    assert editor_client.get("/v1/auth/me").status_code == 200
    assert elsewhere.get("/v1/auth/me").status_code == 401
    assert sign_in(fresh_client(), "mel", NEW)["username"] == "mel"


def test_a_wrong_current_password_changes_nothing(editor_client):
    r = editor_client.post("/v1/auth/password",
                           json={"current_password": "nope", "new_password": NEW})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"current_password": "That isn't your current password."}
    assert sign_in(fresh_client(), "mel")["username"] == "mel"


def test_changing_your_own_needs_a_session(client):
    r = client.post("/v1/auth/password", json={"current_password": PASSWORD, "new_password": NEW})
    assert r.status_code == 401
