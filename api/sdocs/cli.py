"""The sdocs command, for what has to happen outside the app: `create-user`
for an install set up by script, and `set-password`, the way back in when
nobody can sign in as an admin. In Compose: docker compose exec api sdocs ..."""
from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from sdocs.api.schemas import USERNAME_RULE, new_password, normal_username, plain_name
from sdocs.db import get_sessionmaker
from sdocs.models import ROLES, AppUser
from sdocs.services import access, sessions

NAME_MAX = 120  # as the API's Name


def _say(problem: str) -> None:
    print(f"sdocs: {problem}", file=sys.stderr)


def _username(text: str) -> str | None:
    try:
        return normal_username(text)
    except ValueError:
        _say(f"{text!r} won't do as a username. {USERNAME_RULE}")
        return None


def _name(text: str) -> str | None:
    """Their name, checked as the API checks it; None, with the reason said, if it won't do."""
    try:
        name = plain_name(text)
    except ValueError as e:
        _say(f"--name won't do. {e}")
        return None
    if len(name) > NAME_MAX:
        _say(f"--name won't do. Use at most {NAME_MAX} characters.")
        return None
    return name


def _password(given: str | None) -> str | None:
    """The password given, or asked for twice; None, with the reason said, if it won't do."""
    password = given
    if not password:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Password again: ") != password:
            _say("the passwords don't match")
            return None
    if len(password) > access.MAX_PASSWORD:
        _say(f"the password won't do. Use at most {access.MAX_PASSWORD} characters.")
        return None
    try:
        return new_password(password)
    except ValueError as e:
        _say(f"the password won't do. {e}")
        return None


def cmd_create_user(args: argparse.Namespace) -> int:
    username = _username(args.username)
    name = _name(args.name)
    if username is None or name is None:
        return 1
    password = _password(args.password)
    if password is None:
        return 1
    with get_sessionmaker()() as db:
        if db.execute(select(AppUser.id).where(AppUser.username == username)).first():
            _say(f"{username} already exists")
            return 1
        db.add(AppUser(username=username, display_name=name, role=args.role,
                       password_hash=access.hash_password(password), active=True,
                       failed_attempts=0))
        db.commit()
    print(f"{username} created as {args.role}")
    return 0


def cmd_set_password(args: argparse.Namespace) -> int:
    username = _username(args.username)
    if username is None:
        return 1
    with get_sessionmaker()() as db:
        user = db.execute(select(AppUser).where(AppUser.username == username)
                          .with_for_update()).scalar_one_or_none()
        if user is None:
            _say(f"there's no user {username}")
            return 1
        password = _password(args.password)
        if password is None:
            return 1
        user.password_hash = access.hash_password(password)
        user.failed_attempts = 0
        user.locked_until = None
        sessions.end_all(db, user)
        db.commit()
    print(f"{username}'s password is set, any lock cleared and their sessions ended")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sdocs")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("create-user", help="add someone who signs in (an admin unless told)")
    p.add_argument("--username", required=True)
    p.add_argument("--name", required=True, help="their name as Simple Docs shows it")
    p.add_argument("--role", default="admin", choices=ROLES)
    p.add_argument("--password", help="asked for if left out, which keeps it out of your "
                                      "shell's history")
    p.set_defaults(func=cmd_create_user)

    p = sub.add_parser("set-password",
                       help="give someone a new password, clear a lock and end their sessions")
    p.add_argument("--username", required=True)
    p.add_argument("--password", help="asked for if left out")
    p.set_defaults(func=cmd_set_password)

    args = parser.parse_args(argv)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    sys.exit(main())
