from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, fresh_client, sign_in
from sqlalchemy import select

from sdocs.cli import main
from sdocs.models import AppUser

NEW = "a brand new password"


def test_create_user_makes_an_admin_who_can_sign_in(client, db, capsys):
    assert main(["create-user", "--username", "Leighton", "--name", "Leighton Lauton",
                 "--password", PASSWORD]) == 0
    assert "leighton created as admin" in capsys.readouterr().out
    assert sign_in(client, "leighton")["role"] == "admin"
    assert db.execute(select(AppUser.created_by)).scalar_one() is None


def test_create_user_refuses_a_taken_username_or_a_short_password(db, editor, capsys):
    assert main(["create-user", "--username", "mel", "--name", "Mel Two",
                 "--password", PASSWORD]) == 1
    assert "mel already exists" in capsys.readouterr().err
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee",
                 "--password", "short"]) == 1
    assert "at least 12 characters" in capsys.readouterr().err


def test_set_password_lets_a_locked_out_person_back_in(db, editor, editor_client, capsys):
    editor.locked_until = datetime.now(UTC) + timedelta(minutes=15)
    db.commit()
    assert main(["set-password", "--username", "MEL", "--password", NEW]) == 0
    assert "mel's password is set" in capsys.readouterr().out
    assert editor_client.get("/v1/auth/me").status_code == 401
    assert sign_in(fresh_client(), "mel", NEW)["username"] == "mel"


def test_set_password_for_nobody_says_so(db, capsys):
    assert main(["set-password", "--username", "nobody", "--password", NEW]) == 1
    assert "there's no user nobody" in capsys.readouterr().err
