import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from sdocs.models import UserSession
from sdocs.services import sessions

NOW = datetime(2026, 10, 19, 9, 0, tzinfo=UTC)


def test_a_token_is_kept_only_as_its_hash(db, editor):
    raw = sessions.start(db, editor, NOW)
    db.commit()
    row = db.execute(select(UserSession)).scalar_one()
    assert raw.startswith("sdocs_s.") and len(raw) > 40
    assert row.token_hash == hashlib.sha256(raw.encode()).hexdigest()
    assert raw not in row.token_hash
    assert row.created_by == editor.id
    assert row.expires_at == NOW + timedelta(days=14)


def test_a_request_within_12_hours_keeps_it_going(db, editor):
    raw = sessions.start(db, editor, NOW)
    db.commit()
    for hours in (11, 22, 33):
        assert sessions.find(db, raw, NOW + timedelta(hours=hours)) is not None


def test_12_hours_without_a_request_ends_it(db, editor):
    raw = sessions.start(db, editor, NOW)
    db.commit()
    assert sessions.find(db, raw, NOW + timedelta(hours=12, seconds=1)) is None


def test_14_days_after_sign_in_it_ends_however_busy(db, editor):
    raw = sessions.start(db, editor, NOW)
    db.commit()
    t = NOW
    while t + timedelta(hours=11) < NOW + sessions.LIFETIME:
        t += timedelta(hours=11)
        assert sessions.find(db, raw, t) is not None
    assert sessions.find(db, raw, NOW + sessions.LIFETIME) is None


def test_last_seen_is_written_at_most_once_a_minute(db, editor):
    raw = sessions.start(db, editor, NOW)
    db.commit()
    assert sessions.find(db, raw, NOW + timedelta(seconds=30)).last_seen_at == NOW
    later = NOW + timedelta(seconds=90)
    assert sessions.find(db, raw, later).last_seen_at == later


def test_an_unknown_or_foreign_token_finds_nothing(db, editor):
    sessions.start(db, editor, NOW)
    db.commit()
    assert sessions.find(db, "sdocs_s.not-a-real-token", NOW) is None
    assert sessions.find(db, "lms_s.someone-elses", NOW) is None


def test_ending_one_session_leaves_the_others(db, editor):
    one = sessions.start(db, editor, NOW)
    two = sessions.start(db, editor, NOW)
    sessions.end(db, one)
    db.commit()
    assert sessions.find(db, one, NOW) is None
    assert sessions.find(db, two, NOW) is not None


def test_ending_all_of_someones_sessions_can_keep_this_one(db, editor, admin):
    this = sessions.start(db, editor, NOW)
    other = sessions.start(db, editor, NOW)
    admins = sessions.start(db, admin, NOW)
    db.commit()
    sessions.end_all(db, editor, keep=sessions.find(db, this, NOW))
    db.commit()
    assert sessions.find(db, this, NOW) is not None
    assert sessions.find(db, other, NOW) is None
    assert sessions.find(db, admins, NOW) is not None
    sessions.end_all(db, editor)
    db.commit()
    assert sessions.find(db, this, NOW) is None


def test_each_role_has_its_scopes():
    assert sessions.scopes_for("admin") == ["*"]
    assert sessions.scopes_for("editor") == ["documents:read", "documents:write",
                                             "clients:read", "clients:write"]
    assert sessions.scopes_for("reviewer") == ["documents:read", "clients:read",
                                               "reviews:write"]
    assert sessions.scopes_for("owner") == []
