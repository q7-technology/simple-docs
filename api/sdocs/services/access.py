"""Passwords, kept as argon2id hashes (the design's data model). Hashes
only, never the password."""
from __future__ import annotations

import secrets

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

MIN_PASSWORD = 12
MAX_PASSWORD = 200

# argon2-cffi's defaults: RFC 9106's low-memory profile (3 passes, 64 MiB,
# 4 lanes). Tens of milliseconds a check; a guesser pays it every time.
_hasher = PasswordHasher()

# Checked when there is no real hash to check, so an unknown username takes
# as long as a wrong password. The same work as a real hash; nothing matches
# it, because nobody knows what it hashes.
DUMMY_HASH = _hasher.hash(secrets.token_urlsafe(32))


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        return _hasher.verify(stored, password)
    except (VerificationError, InvalidHashError):
        # a wrong password, or a damaged hash: matches nothing, never a 500
        return False


def needs_rehash(stored: str) -> bool:
    """True when this hash was made with weaker settings than today's, so the
    next right password should replace it. A damaged hash: False."""
    try:
        return _hasher.check_needs_rehash(stored)
    except InvalidHashError:
        return False
