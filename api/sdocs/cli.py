"""The sdocs command, for what has to happen outside the app: `create-user`
for an install set up by script, and `set-password`, the way back in when
nobody can sign in as an admin.

A password is never an argument, where it would sit in the shell's history
and in `ps`. The command asks for it twice, or, with --password-stdin, reads
one line from stdin. In Compose:

    docker compose exec api sdocs set-password --username mel
    printf '%s\\n' "$PW" |
      docker compose exec -T api sdocs set-password --username mel --password-stdin
"""
from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from sdocs.api.schemas import NAME_MAX, USERNAME_RULE, new_password, normal_username, plain_name
from sdocs.db import get_sessionmaker
from sdocs.models import ROLES, AppUser
from sdocs.services import access, sessions

USERNAME_TAKEN = "uq_app_user_username"


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


def _password(from_stdin: bool) -> str | None:
    """One line from stdin, or asked for twice; None, with the reason said, if it won't do."""
    if from_stdin:
        # only the line ending goes: spaces are part of a password
        password = sys.stdin.readline().rstrip("\r\n")
        if not password:
            _say("no password on stdin")
            return None
    else:
        try:
            password = getpass.getpass("Password: ")
            again = getpass.getpass("Password again: ")
        except (EOFError, KeyboardInterrupt):
            print(file=sys.stderr)
            _say("no password given")
            return None
        if again != password:
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
    password = _password(args.password_stdin)
    if password is None:
        return 1
    password_hash = access.hash_password(password)
    with get_sessionmaker()() as db:
        if db.execute(select(AppUser.id).where(AppUser.username == username)).first():
            _say(f"{username} already exists")
            return 1
        db.add(AppUser(username=username, display_name=name, role=args.role,
                       password_hash=password_hash, active=True, failed_attempts=0))
        try:
            db.commit()
        except IntegrityError as e:
            # someone took the username between the check and the commit
            db.rollback()
            if getattr(getattr(e.orig, "diag", None), "constraint_name", None) != USERNAME_TAKEN:
                raise
            _say(f"{username} already exists")
            return 1
    print(f"{username} created as {args.role}")
    return 0


def cmd_set_password(args: argparse.Namespace) -> int:
    username = _username(args.username)
    if username is None:
        return 1
    find = select(AppUser).where(AppUser.username == username)
    # say there's nobody before asking for anything, but hold no lock (nor a
    # transaction) while the prompt waits
    with get_sessionmaker()() as db:
        exists = db.execute(find).scalar_one_or_none() is not None
    if not exists:
        _say(f"there's no user {username}")
        return 1
    password = _password(args.password_stdin)
    if password is None:
        return 1
    password_hash = access.hash_password(password)
    with get_sessionmaker()() as db:
        user = db.execute(find.with_for_update()).scalar_one()
        user.password_hash = password_hash
        user.failed_attempts = 0
        user.locked_until = None
        sessions.end_all(db, user)
        db.commit()
    print(f"{username}'s password is set, any lock cleared and their sessions ended")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="sdocs")
    sub = parser.add_subparsers(dest="command", required=True)
    stdin_help = ("read the password from one line of stdin instead of asking for it, "
                  "e.g. printf '%%s\\n' \"$PW\" | sdocs ... --password-stdin")

    p = sub.add_parser("create-user", help="add someone who signs in (an admin unless told)")
    p.add_argument("--username", required=True)
    p.add_argument("--name", required=True, help="their name as Simple Docs shows it")
    p.add_argument("--role", default="admin", choices=ROLES)
    p.add_argument("--password-stdin", action="store_true", help=stdin_help)
    p.set_defaults(func=cmd_create_user)

    p = sub.add_parser("set-password",
                       help="give someone a new password, clear a lock and end their sessions")
    p.add_argument("--username", required=True)
    p.add_argument("--password-stdin", action="store_true", help=stdin_help)
    p.set_defaults(func=cmd_set_password)

    args = parser.parse_args(argv)
    result: int = args.func(args)
    return result


if __name__ == "__main__":
    sys.exit(main())
