import os
import threading
from concurrent.futures import ThreadPoolExecutor

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

# The compose db listens on 127.0.0.1:5436 (Simple WMS has 5433, Simple TMS
# 5434, Simple LMS 5435), user sdocs.
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://sdocs:sdocs-dev@127.0.0.1:5436/sdocs_test"
)
os.environ["DOCS_DATABASE_URL"] = TEST_DATABASE_URL

# A request that changes something carries this, as the desktop's does
# (Task 8's guard).
SAME_SITE = {"X-Simple-Docs": "1"}


def _ensure_database():
    admin_url = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    name = TEST_DATABASE_URL.rsplit("/", 1)[1]
    # the engine fixture drops the whole schema, so never point it at real data
    assert name.endswith("_test"), (
        f"TEST_DATABASE_URL names the database {name!r}; the tests wipe it, "
        "so its name must end in _test"
    )
    engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        exists = conn.execute(
            text("select 1 from pg_database where datname = :n"), {"n": name}
        ).scalar()
        if not exists:
            conn.execute(text(f'create database "{name}"'))
    engine.dispose()


@pytest.fixture(scope="session")
def engine():
    _ensure_database()
    engine = create_engine(TEST_DATABASE_URL)
    with engine.begin() as conn:
        conn.execute(text("drop schema public cascade"))
        conn.execute(text("create schema public"))
    from alembic import command
    from alembic.config import Config

    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", TEST_DATABASE_URL)
    cfg.attributes["configure_logger"] = False
    command.upgrade(cfg, "head")
    yield engine
    engine.dispose()
    # and the app's own, so no connection is left for the garbage collector
    from sdocs.db import get_engine

    get_engine().dispose()


@pytest.fixture
def db(engine):
    from sdocs.models import Base

    with Session(engine) as session:
        yield session
        session.rollback()
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    if tables:
        with engine.begin() as conn:
            # TRUNCATE is not UPDATE or DELETE, so block_change() lets it by
            conn.execute(text(f"truncate {tables} restart identity cascade"))


def fresh_client():
    """A test client of its own: its own cookies, for one person or thread."""
    from fastapi.testclient import TestClient

    from sdocs.api.app import app

    return TestClient(app, headers=SAME_SITE)


@pytest.fixture
def client(db):
    # through db, so whatever a request writes is truncated after the test too
    with fresh_client() as c:
        yield c


def all_at_once(n: int, call):
    """Run call() n times on n threads released together; return the results."""
    start = threading.Barrier(n)

    def one():
        start.wait()
        return call()

    with ThreadPoolExecutor(max_workers=n) as pool:
        return [f.result() for f in [pool.submit(one) for _ in range(n)]]


# --- people -----------------------------------------------------------------

PASSWORD = "correct horse battery"


def make_user(db, username: str, display_name: str, role: str = "editor", *,
              password: str = PASSWORD, active: bool = True):
    from sdocs.models import AppUser
    from sdocs.services.access import hash_password

    user = AppUser(username=username, display_name=display_name, role=role, active=active,
                   password_hash=hash_password(password))
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def admin(db):
    return make_user(db, "leighton", "Leighton Lauton", "admin")


@pytest.fixture
def editor(db):
    return make_user(db, "mel", "Mel Grant", "editor")


@pytest.fixture
def reviewer(db):
    return make_user(db, "sam", "Sam Vu", "reviewer")


def sign_in(client, username: str, password: str = PASSWORD) -> dict:
    r = client.post("/v1/auth/sign-in", json={"username": username, "password": password})
    assert r.status_code == 200, r.text
    return r.json()


def signed_in_client(user, password: str = PASSWORD):
    """A client of its own with this person's session cookie."""
    c = fresh_client()
    sign_in(c, user.username, password)
    return c


@pytest.fixture
def admin_client(admin):
    return signed_in_client(admin)


@pytest.fixture
def editor_client(editor):
    return signed_in_client(editor)


@pytest.fixture
def reviewer_client(reviewer):
    return signed_in_client(reviewer)
