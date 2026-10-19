import getpass
import io
import sys
from datetime import UTC, datetime, timedelta

import pytest
from conftest import PASSWORD, fresh_client, sign_in
from sqlalchemy import select, text

from sdocs.cli import main
from sdocs.models import AppUser

NEW = "a brand new password"


@pytest.fixture
def stdin(monkeypatch):
    """Gives the command this text on stdin, as `printf '%s\\n' "$PW" |` does."""
    def give(text: str) -> None:
        monkeypatch.setattr(sys, "stdin", io.StringIO(text))
    return give


@pytest.fixture
def typed(monkeypatch):
    """Answers the command's password prompts, in order, with these."""
    def answer(*replies: str | BaseException) -> list[str]:
        prompts: list[str] = []
        left = iter(replies)

        def ask(prompt: str = "") -> str:
            prompts.append(prompt)
            reply = next(left)
            if isinstance(reply, BaseException):
                raise reply
            return reply

        monkeypatch.setattr(getpass, "getpass", ask)
        return prompts
    return answer


def test_create_user_makes_an_admin_who_can_sign_in(client, db, stdin, capsys):
    stdin(PASSWORD + "\n")
    assert main(["create-user", "--username", "Leighton", "--name", "Leighton Lauton",
                 "--password-stdin"]) == 0
    assert "leighton created as admin" in capsys.readouterr().out
    assert sign_in(client, "leighton")["role"] == "admin"
    assert db.execute(select(AppUser.created_by)).scalar_one() is None


def test_create_user_refuses_a_taken_username_or_a_short_password(db, editor, stdin, capsys):
    stdin(PASSWORD + "\n")
    assert main(["create-user", "--username", "mel", "--name", "Mel Two",
                 "--password-stdin"]) == 1
    assert "mel already exists" in capsys.readouterr().err
    stdin("short\n")
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee",
                 "--password-stdin"]) == 1
    assert "at least 12 characters" in capsys.readouterr().err


def test_create_user_that_loses_a_race_for_the_username_says_it_exists(db, stdin, capsys,
                                                                      beaten_to_it):
    beaten_to_it(AppUser(username="kim", display_name="Kim Other", role="editor",
                         password_hash="x"), "username")
    stdin(PASSWORD + "\n")
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee",
                 "--password-stdin"]) == 1
    assert "kim already exists" in capsys.readouterr().err


def test_create_user_asks_twice_when_no_password_is_piped(client, db, typed, capsys):
    prompts = typed(PASSWORD, PASSWORD)
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee"]) == 0
    assert prompts == ["Password: ", "Password again: "]
    assert sign_in(client, "kim")["username"] == "kim"


def test_create_user_refuses_passwords_that_dont_match(db, typed, capsys):
    typed(PASSWORD, PASSWORD + "!")
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee"]) == 1
    assert "the passwords don't match" in capsys.readouterr().err
    assert db.execute(select(AppUser)).first() is None


@pytest.mark.parametrize("stop", [EOFError(), KeyboardInterrupt()])
def test_a_prompt_given_up_on_stops_quietly(db, typed, capsys, stop):
    typed(stop)
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee"]) == 1
    assert "no password given" in capsys.readouterr().err
    assert db.execute(select(AppUser)).first() is None


def test_empty_stdin_is_no_password(db, editor, stdin, capsys):
    stdin("")
    assert main(["set-password", "--username", "mel", "--password-stdin"]) == 1
    assert "no password on stdin" in capsys.readouterr().err
    stdin("\n")
    assert main(["create-user", "--username", "kim", "--name", "Kim Lee",
                 "--password-stdin"]) == 1
    assert "no password on stdin" in capsys.readouterr().err


def test_a_piped_password_keeps_its_spaces(client, db, editor, stdin, capsys):
    stdin(NEW + "  \r\n")
    assert main(["set-password", "--username", "mel", "--password-stdin"]) == 0
    assert sign_in(fresh_client(), "mel", NEW + "  ")["username"] == "mel"
    assert fresh_client().post("/v1/auth/sign-in",
                               json={"username": "mel", "password": NEW}).status_code == 401


def test_set_password_lets_a_locked_out_person_back_in(db, editor, editor_client, stdin, capsys):
    editor.locked_until = datetime.now(UTC) + timedelta(minutes=15)
    editor.failed_attempts = 5
    db.commit()
    stdin(NEW + "\n")
    assert main(["set-password", "--username", "MEL", "--password-stdin"]) == 0
    assert "mel's password is set" in capsys.readouterr().out
    assert editor_client.get("/v1/auth/me").status_code == 401
    assert sign_in(fresh_client(), "mel", NEW)["username"] == "mel"


def test_set_password_asks_twice_when_no_password_is_piped(db, editor, typed, capsys):
    prompts = typed(NEW, NEW)
    assert main(["set-password", "--username", "mel"]) == 0
    assert prompts == ["Password: ", "Password again: "]
    assert sign_in(fresh_client(), "mel", NEW)["username"] == "mel"


def test_set_password_for_nobody_says_so_before_asking(db, typed, capsys):
    prompts = typed(NEW, NEW)
    assert main(["set-password", "--username", "nobody"]) == 1
    assert "there's no user nobody" in capsys.readouterr().err
    assert prompts == []


def test_set_password_doesnt_hold_the_row_while_asking(db, editor, engine, monkeypatch,
                                                       capsys):
    # while the prompt waits, someone else can still change the person's row
    def ask_and_meanwhile_update(prompt: str = "") -> str:
        with engine.connect() as other:
            other.execute(text("set lock_timeout = '2s'"))
            other.execute(text("update app_user set failed_attempts = 1 where username = 'mel'"))
            other.commit()
        return NEW

    monkeypatch.setattr(getpass, "getpass", ask_and_meanwhile_update)
    assert main(["set-password", "--username", "mel"]) == 0
    db.expire_all()
    assert db.get(AppUser, editor.id).failed_attempts == 0


def test_password_is_not_an_argument(capsys):
    with pytest.raises(SystemExit):
        main(["set-password", "--username", "mel", "--password", NEW])
