from argon2 import PasswordHasher

from sdocs.services import access


def _params(stored: str) -> str:
    # $argon2id$v=19$m=65536,t=3,p=4$<salt>$<hash>
    return stored.split("$")[3]


def test_a_password_is_kept_as_an_argon2id_hash():
    stored = access.hash_password("correct horse battery")
    assert stored.startswith("$argon2id$")
    assert "correct horse battery" not in stored
    assert access.verify_password("correct horse battery", stored)
    assert not access.verify_password("correct horse batterY", stored)


def test_the_same_password_hashes_differently_each_time():
    assert access.hash_password("same password") != access.hash_password("same password")


def test_no_hash_or_a_damaged_one_matches_nothing_and_never_raises():
    assert not access.verify_password("anything", None)
    assert not access.verify_password("anything", "")
    assert not access.verify_password("anything", "$argon2id$v=19$m=65536,t=3,p=4$broken")
    assert not access.verify_password("anything", "pbkdf2_sha256$600000$00$00")


def test_the_dummy_hash_costs_what_a_real_one_does_and_matches_nothing():
    assert _params(access.DUMMY_HASH) == _params(access.hash_password("x"))
    for guess in ("", "password", "correct horse battery"):
        assert not access.verify_password(guess, access.DUMMY_HASH)


def test_a_hash_made_with_weaker_settings_needs_rehashing():
    assert not access.needs_rehash(access.hash_password("correct horse battery"))
    weaker = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash("x")
    assert access.needs_rehash(weaker)
    # a damaged hash can't be checked, so it is not rehashed either (and never raises)
    assert not access.needs_rehash("$argon2id$v=19$m=65536,t=3,p=4$broken")
    assert not access.needs_rehash("pbkdf2_sha256$600000$00$00")
