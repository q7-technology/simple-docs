# Simple Docs step 1: Skeleton — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build step 1 of `docs/plans/2026-10-19-simple-docs-design.md`: the repo, Docker Compose (`db`, `api`, `caddy`), settings, people who sign in with a username and password, roles and their scopes, sessions, the first run, users and roles managed by an admin, the organisation's details and logo, the reusable append-only trigger function, and CI. The desktop app has the Q7 dark theme, sign in, first run, the app shell with honest empty states for what comes later, Users, and Settings → Organisation. Usable end to end: on an empty install someone opens `http://localhost:8080`, creates the first admin and names the organisation, adds the ABN and logo, adds an editor and a reviewer, and each of them signs in and sees the shell.

**Architecture:** One FastAPI app (`api/`, package `sdocs`) over PostgreSQL 16, laid out like Simple LMS's `api/lms`: `config.py` (pydantic-settings, `DOCS_` prefix), `db.py`, `models/`, `services/` (`access`, `sessions`, `settings`), `api/` (`deps` with `require(scope)`, `errors`, `guard`, `schemas`, `routes/`), `cli.py`, Alembic migrations run on every API start. The session is an opaque token in an httpOnly, SameSite=Strict cookie (the design), kept in the database only as its SHA-256; a request that changes something must also carry `X-Simple-Docs: 1`. Migration 0001 creates `block_change()`, the trigger function every append-only table uses from step 2, and puts it on `app_user` for DELETE so people are deactivated, never deleted. The desktop (`apps/desktop`, Vite + React + TypeScript + Tailwind) is an ordinary API client; its Tailwind theme is built from the Q7 design system's `tokens.json`, and it recreates `Card`, `Button`, `Input`, `Textarea`, `Badge`, `Chip` and `SectionHeading` from the design system's READMEs. Caddy serves the built app at `http://localhost:8080` and proxies `/api` to the API. The worker arrives with step 3.

**Tech Stack:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic, psycopg 3, argon2-cffi, pytest against a real PostgreSQL 16, ruff, mypy; Vite 6, React 19, TypeScript 5, Tailwind 4, lucide-react, Vitest 3 with Testing Library, ESLint 9; Docker Compose, Caddy 2, GitHub Actions.

---

## Context

The design is settled; this plan does not change any of its decisions. Patterns come from Simple LMS (`/Users/leightonlauton/Q7 Technology/Software/q7/simple-lms/`, paths relative to it), from the code as shipped rather than its step 1 plan where the two differ, and from the Q7 design system (`/Users/leightonlauton/Q7 Technology/Software/q7/design-system/`).

### Patterns copied from Simple LMS

- **Settings, engine, naming convention:** `api/lms/config.py` (pydantic-settings, a prefix, secrets as `Field(default="", repr=False)`), `api/lms/db.py`, `api/lms/models/base.py` (`ix_`, `uq_`, `ck_`, `fk_`, `pk_` names; `created_at_column()`).
- **Password checks:** the shape of `api/lms/services/access.py` as shipped: `hash_password`, `verify_password`, a `DUMMY_HASH` checked for an unknown person so an unknown username takes as long as a wrong password, and a damaged hash is a wrong password, never a 500. The hash itself is argon2id, as this design's data model says (LMS ships PBKDF2).
- **Sign-in:** `api/lms/api/routes/auth.py` as shipped: the person's row is locked `with_for_update()` while an attempt is counted, so guesses sent all at once still lock after five; an unknown username and a wrong password answer alike, with no tries-left count; five wrong lock it for 15 minutes.
- **Sessions:** `api/lms/services/sessions.py` as shipped: a random token with a prefix, only its SHA-256 stored, `last_seen_at` written at most once a minute, an idle limit and an absolute lifetime, `end` and `end_all`, and a role → scopes table read on every request.
- **`Principal`, `get_principal`, `require(scope)`:** `api/lms/api/deps.py`; `has_scope` takes `*` and `area:*`.
- **Errors:** the exception-handler layout and `commit_unique()` of `api/lms/api/errors.py`, with this design's error shape instead of LMS's.
- **Append-only trigger:** `block_change()` in `api/alembic/versions/0001_skeleton.py`.
- **Tests on a real Postgres:** `api/tests/conftest.py` makes and resets its own `*_test` database, truncates every table after each test (TRUNCATE gets past the trigger), `all_at_once` and `fresh_client` for races, `beaten_to_it` for a unique constraint lost at the last moment; `api/tests/test_migrations.py` runs up, down, up and checks the models against a fresh database.
- **Migrations on start, Compose, Dockerfile:** `docker-compose.yml`'s `api` runs `alembic upgrade head` before `uvicorn`; `api/Dockerfile`.
- **Caddy:** `deploy/Caddyfile` as shipped: the folder mounted rather than the file, security headers, a CSP for the app, the app's page asked for afresh (`Cache-Control: no-cache`), `try_files {path} /index.html`.
- **CI:** `.github/workflows/ci.yml`: API tests against a Postgres service, the app tested and built, and a Compose start that checks the database objects are there.
- **Desktop:** `apps/desktop` (package.json, vite.config.ts with a proxy, tsconfig.json, Vitest in jsdom, `src/test/harness.tsx`'s `stubApi` and `renderApp`, `src/api/client.ts`'s `ApiError` and `Unreachable`, `src/auth/AuthContext.tsx`).

### The Q7 design system in the app

- `tokens.json` is copied into `apps/desktop/src/design/tokens.json`; `src/design/theme.ts` turns it into the Tailwind theme (`tailwind.config.ts`, loaded with `@config`). Colours keep their token names (`bg-space-darkBlue`, `text-space-lightGray`, `border-space-blue/20`), type styles are sizes by role (`text-section-title-sm`, `text-card-title`, `text-label`, `text-body-sm`, `text-caption`, `text-eyebrow`), radii and shadows keep theirs (`rounded-lg`, `shadow-glow-blue`), and layout widths are `max-w-shell`, `max-w-panel`, `max-w-prose`.
- One dark theme, no `dark:` variants. `body` is `space-darkBlue`; cards are `space-darkBlue/60` with a `space-blue/20` border and a backdrop blur over a static star field. Headings and values are `space-lightGray`, prose and meta `space-gray`.
- Primary buttons are `bg-space-blue text-space-darkBlue` (the AA fix; white on `space-blue` is 2.6:1). Gold marks warnings only (this design: DRAFT, warnings, test runs).
- lucide-react icons at 1.5px (one CSS rule on `svg.lucide`), decorative ones `aria-hidden`. The focus ring is 2px `ring` with a 2px offset and is never removed. The shell's first focusable element is a skip link. Under `prefers-reduced-motion` every animation and transition collapses to its last frame.

### Ports on one machine

Simple WMS has `127.0.0.1:5433` (database) and `8011` (API) in its `.env`; Simple TMS `5434` and `8022`; Simple LMS `5435` and `8033`, with its Caddy on 8280 and 8643 locally; video-generator also publishes its database on 5433. Simple Docs takes **5436** for the database and **8044** for the API (both checked free). Caddy's host port is a setting, `DOCS_HTTP_PORT`, **8080** by default as the design says; on Q7's Mac 8080 is Platen's web app (`PLATEN_WEB_PORT`) and the Q7 site's Vite server, so the local `.env` uses **8380**, beside Simple TMS's 8180 and Simple LMS's 8280. Vite runs on **5178**, beside Simple WMS's 5173 and 5174, Simple TMS's 5174 and 5175 and Simple LMS's 5176 and 5177.

### Decisions this plan makes that the design leaves open

- **The Python package is `sdocs` and the command is `sdocs`.** The design's `docs/` package name reads as a folder of documentation; `sdocs` says what it is. The API is `api/sdocs`, the console script `sdocs`.
- **argon2id with argon2-cffi's defaults** (RFC 9106's low-memory profile: 3 passes, 64 MiB, 4 lanes), as the design's data model says; Simple LMS's PBKDF2 shape (`DUMMY_HASH`, damaged hash is a wrong password) is kept.
- **The session lives in the cookie only.** `sdocs_session`, httpOnly, SameSite=Strict, `Path=/`, `Secure` when `DOCS_COOKIE_SECURE=true` (off by default, because the design serves plain `http://localhost:8080`). Sign-in answers with the person, never the token, so no script on the page can read it. A script uses a cookie jar (`curl -c jar -b jar`), so rule 4 holds. Token `sdocs_s.` + 32 random bytes; 12 hours idle (sliding), 14 days in all; `last_seen_at` written at most once a minute. A new password ends that person's other sessions; deactivation ends all of them.
- **Requests that change something carry `X-Simple-Docs: 1`.** SameSite=Strict stops other sites, but every other app on `localhost` counts as the same site. A page can't add a custom header to a cross-origin request without a CORS preflight, which this API never answers, so the header closes that gap. Reads need no header. The desktop's client always sends it.
- **The API is at `/v1/...`; Caddy serves it at `/api/v1/...`** (`handle_path /api/*`, as the design's "proxies `/api`"), and Vite's dev proxy does the same. `/docs` (FastAPI's page) is on the API's own port only.
- **Scopes:** reviewer `documents:read`, `clients:read`, `reviews:write`; editor `documents:read`, `documents:write`, `clients:read`, `clients:write`, `reviews:write`; admin `*`. Editors can approve someone else's version as reviewers can (a decision by Leighton, 2026-10-19; the design's §6 says so); reviewers approve but never edit, and nobody approves their own version. Users, settings, templates and spend are admin-only and need no scope of their own beyond `*`. Step 1 checks `users:read`, `users:write`, `settings:write`; later steps check the rest and may add to the lists.
- **Usernames** are kept lower case (checked by the database), 2 to 64 of `a-z 0-9 . _ -`, starting with a letter or number; typed in any case. **Passwords** are 12 to 200 characters.
- **Every table has `id uuid`, `created_at`, `created_by`** (the design). `app_user.created_by` is null for the first admin and anyone made by the command line. A session's `created_by` is the person who signed in, so it is also the session's owner. `setting` adds `updated_at` and `updated_by`.
- **`block_change()` names the operation and the table** (`DELETE on app_user is not allowed: rows here are kept as they are`) so one function serves both "append-only" (UPDATE and DELETE, step 2's `document_version`) and "never deleted" (DELETE only, `app_user` now).
- **The logo is a row in a small `org_logo` table** (`mime`, `content bytea`, `created_at`, `created_by`), and the `org.logo` setting holds the id of the one in use. `bytea` keeps one `pg_dump` a full backup (the design); a table rather than base64 inside the JSON setting keeps 512 KB of bytes out of every settings read, and lets the logo be served with its own type. A new upload is a new row; removing the logo clears the setting. PNG or JPEG only (checked by their first bytes, not just the header), 512 KB at most; SVG is refused because it can carry script.
- **The logo and the organisation's name are public** (`GET /v1/branding`, `GET /v1/branding/logo`): the sign-in and first-run pages show them before anyone signs in. Everything else needs a session.
- **First run asks for the organisation's name and the first admin only.** The rest of the design's first-run screen (ABN and contact details, logo, OpenRouter key check, budget) comes from Settings → Organisation now and from step 3's settings later; first run ends on Settings → Organisation. Two first runs at once make one admin (a transaction-scoped advisory lock).
- **A locked reply says the username exists.** Five wrong passwords answer `locked`, which an unknown username never does. That is accepted, as in Simple LMS: the lock is what stops guessing, and saying nothing about it would leave the person wondering why their right password fails. A locked reply still checks the password against `DUMMY_HASH`, so it takes as long as a real attempt; and a right password whose hash was made with weaker argon2 settings than today's is hashed again (`access.needs_rehash`).
- **The last active admin can't be demoted or deactivated, and nobody deactivates themselves.** Every active admin's row is locked in id order before the check, so two admins demoting each other at once leave one in charge.
- **Everyone changes their own password** (`POST /v1/auth/password`, the Account page); an admin can set anyone's (`POST /v1/users/{id}/password`), which also clears a lock. The command line (`sdocs create-user`, `sdocs set-password`) is the way back in when no admin can sign in.
- **The ABN is checked with the ATO's checksum** and stored as `51 824 753 556`. Email is a plain shape check. Optional fields left blank are stored as null.
- **The navbar** is the design's: Simple Docs · Documents · Clients · Templates · Spend, with Templates and Spend shown to admins only (the design's screens table), and on the right the person's name (to Account), a Settings link for admins and Sign out. The pages not built yet say when they arrive: Documents and Clients step 2, Spend step 3, Templates step 7.
- **The brand mark** is the organisation's logo from Settings, else a neutral Simple Docs mark drawn as SVG (a page with a folded corner, three lines of text and a four-point sparkle, in `space-lightGray`, `space-gray` and `space-blue`). The app is open source, so the Q7 logo is not bundled; Q7 uploads `design-system/assets/Logos/q7-logo-128.png` in Settings like anyone else.
- **Buttons:** `primary` (filled `space-blue`, `space-darkBlue` text), `outline` (a `space-blue/30` hairline, light text), `ghost`, `destructive`. The design system pairs a blue fill with a gold outline, but this design keeps gold for warnings, so the second action is a blue hairline.
- **The star field is static**: about 140 points drawn once from a seeded sequence into one `aria-hidden` SVG. Nothing on it moves, so it costs nothing and needs no reduced-motion handling of its own.
- **Lint and types in CI from the start:** ruff and mypy for the API, ESLint and `tsc` (through `npm run build`) for the desktop, beside the tests. Playwright arrives with the first end-to-end flow worth driving (the design's sign in → handover → approved PDF).
- **No worker in Compose yet.** Nothing queues until step 3; Compose has a comment where it goes. `DOCS_REPO_ROOT` is in the settings and `.env.example` now and is mounted from step 4, when something reads it.

---

## Before you start

```
cd "/Users/leightonlauton/Q7 Technology/Software/q7/simple-docs"
git switch -c step-1-skeleton
```

You need `uv`, Node 22 and Docker. All `pytest`, `ruff` and `mypy` commands run from `api/` and need the compose `db` (Task 1 starts it on 127.0.0.1:5436). If the database listens somewhere else, set `TEST_DATABASE_URL`. `npm` commands run from `apps/desktop/`. Every commit message ends with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; the commands below pass it as the last `-m`.

---

### Task 1: Repo files and the database

**Files:**
- Create: `.gitignore`, `LICENSE`
- Create: `docker-compose.yml` (db only for now), `.env.example` (database part for now)
- Create: `api/.python-version`, `api/.dockerignore`, `api/pyproject.toml`
- Create: `api/alembic.ini`, `api/alembic/env.py`, `api/alembic/script.py.mako`, `api/alembic/versions/.gitkeep`
- Create: `api/sdocs/__init__.py` (empty)

**Step 1: Write the files**

`.gitignore`:
```
.env
__pycache__/
.venv/
*.pyc
.DS_Store
.pytest_cache/
.ruff_cache/
.mypy_cache/
*.egg-info/
node_modules/
dist/
*.tsbuildinfo
```

`LICENSE`:
```
MIT License

Copyright (c) 2026 Q7 Technology

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`docker-compose.yml` (Task 16 adds `api`, Task 26 `caddy`):
```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-sdocs}
      POSTGRES_USER: ${POSTGRES_USER:-sdocs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # 5436 so it sits beside Simple WMS's (5433), Simple TMS's (5434) and
    # Simple LMS's (5435) on one machine
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5436}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-sdocs} -d ${POSTGRES_DB:-sdocs}"]
      interval: 5s
      timeout: 3s
      retries: 20

volumes:
  pgdata:
```

`.env.example` (Task 16 replaces it with the full file):
```
# Copy to .env and fill in. Nothing here is committed.

# Postgres (used by the db and api containers)
POSTGRES_DB=sdocs
POSTGRES_USER=sdocs
POSTGRES_PASSWORD=change-me
# Host port the database is published on (127.0.0.1 only). 5436 sits beside
# Simple WMS's 5433, Simple TMS's 5434 and Simple LMS's 5435. The tests expect
# POSTGRES_PASSWORD=sdocs-dev on this port unless TEST_DATABASE_URL says otherwise.
POSTGRES_PORT=5436
```

`api/.python-version`:
```
3.12
```

`api/.dockerignore`:
```
.venv
__pycache__
*.pyc
tests
.pytest_cache
.ruff_cache
.mypy_cache
```

`api/pyproject.toml`:
```toml
[project]
name = "simple-docs-api"
version = "0.1.0"
description = "Simple Docs API"
requires-python = ">=3.12"
license = "MIT"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.30",
  "pydantic>=2.8",
  "pydantic-settings>=2.4",
  "sqlalchemy>=2.0.30",
  "psycopg[binary]>=3.2",
  "alembic>=1.13",
  # argon2id password hashes, as the design's data model says
  "argon2-cffi>=23.1",
]

[project.optional-dependencies]
# httpx2: what newer Starlette test clients want, as in Simple LMS
dev = ["pytest>=8", "pytest-timeout>=2.3", "httpx2>=0.1", "ruff>=0.6", "mypy>=1.11"]

[project.scripts]
sdocs = "sdocs.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["sdocs"]

[tool.pytest.ini_options]
testpaths = ["tests"]
timeout = 60
filterwarnings = [
  "error",
  # third-party: Starlette's test client still uses an old anyio alias
  "ignore:The anyio.abc.BlockingPortal alias is deprecated:DeprecationWarning",
]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "B", "UP"]

[tool.ruff.lint.isort]
known-first-party = ["sdocs"]

[tool.ruff.lint.per-file-ignores]
# a test reads best with its assertion on one line
"tests/*" = ["E501"]

[tool.mypy]
python_version = "3.12"
packages = ["sdocs"]
ignore_missing_imports = true
```

`api/alembic.ini`:
```ini
[alembic]
script_location = alembic
prepend_sys_path = .
path_separator = os
file_template = %%(rev)s_%%(slug)s
# Overridden by DOCS_DATABASE_URL in env.py
sqlalchemy.url = postgresql+psycopg://sdocs:sdocs@127.0.0.1:5432/sdocs

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

`api/alembic/env.py` (Simple LMS's, with `sdocs`; the `configure_logger` switch lets tests run migrations without silencing the app's loggers):
```python
import os
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from sdocs.models import Base

config = context.config
if config.config_file_name is not None and config.attributes.get("configure_logger", True):
    fileConfig(config.config_file_name)

if os.environ.get("DOCS_DATABASE_URL"):
    config.set_main_option("sqlalchemy.url", os.environ["DOCS_DATABASE_URL"])

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    try:
        with connectable.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                compare_server_default=True,
            )
            with context.begin_transaction():
                context.run_migrations()
    finally:
        connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

`api/alembic/script.py.mako` is Simple LMS's, unchanged:
```
mkdir -p api/alembic/versions api/sdocs
cp "/Users/leightonlauton/Q7 Technology/Software/q7/simple-lms/api/alembic/script.py.mako" api/alembic/script.py.mako
touch api/alembic/versions/.gitkeep api/sdocs/__init__.py
```

**Step 2: Start the database and install the API's packages**

```
cp .env.example .env
sed -i '' 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=sdocs-dev/' .env
docker compose up -d db
cd api && uv venv -p 3.12 && uv pip install -e ".[dev]" && cd ..
```

**Step 3: Check both**

Run: `docker compose exec db pg_isready -U sdocs -d sdocs`
Expected: `/var/run/postgresql:5432 - accepting connections`

Run: `cd api && .venv/bin/python -c "import sdocs, fastapi, argon2, sqlalchemy; print('ok')"`
Expected: `ok`

**Step 4: Commit**

```
git add .gitignore LICENSE docker-compose.yml .env.example api/.python-version api/.dockerignore \
  api/pyproject.toml api/alembic.ini api/alembic/env.py api/alembic/script.py.mako \
  api/alembic/versions/.gitkeep api/sdocs/__init__.py
git commit -m "Start the repo: MIT licence, the database in Compose and the API's project" \
  -m "Postgres on 127.0.0.1:5436, beside Simple WMS's, Simple TMS's and Simple LMS's." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Settings from `DOCS_` variables, secrets never printed

**Files:**
- Create: `api/sdocs/config.py`
- Test: `api/tests/test_config.py`

**Step 1: Write the failing test**

`api/tests/test_config.py`:
```python
from sdocs.config import Settings

SECRETS = {
    "DOCS_OPENROUTER_API_KEY": "sk-or-v1-0123456789abcdef",
    "DOCS_GITHUB_TOKEN": "github_pat_0123456789abcdef",
    "DOCS_MONKIRO_API_KEY": "mk_live_0123456789abcdef",
}


def test_settings_come_from_docs_variables(monkeypatch):
    monkeypatch.setenv("DOCS_DATABASE_URL", "postgresql+psycopg://a:b@db:5432/sdocs")
    monkeypatch.setenv("DOCS_REPO_ROOT", "/srv/repos")
    monkeypatch.setenv("DOCS_COOKIE_SECURE", "true")
    s = Settings()
    assert s.database_url == "postgresql+psycopg://a:b@db:5432/sdocs"
    assert s.repo_root == "/srv/repos"
    assert s.cookie_secure is True


def test_secrets_are_read_but_never_printed(monkeypatch):
    for name, value in SECRETS.items():
        monkeypatch.setenv(name, value)
    s = Settings()
    assert s.openrouter_api_key == SECRETS["DOCS_OPENROUTER_API_KEY"]
    assert s.github_token == SECRETS["DOCS_GITHUB_TOKEN"]
    assert s.monkiro_api_key == SECRETS["DOCS_MONKIRO_API_KEY"]
    shown = repr(s) + str(s)
    for value in SECRETS.values():
        assert value not in shown


def test_a_variable_without_the_prefix_is_not_read(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-v1-wrong-name")
    assert Settings().openrouter_api_key == ""


def test_the_cookie_is_not_secure_by_default_for_plain_localhost(monkeypatch):
    monkeypatch.delenv("DOCS_COOKIE_SECURE", raising=False)
    assert Settings().cookie_secure is False
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_config.py -v`
Expected: ERROR collecting, `ModuleNotFoundError: No module named 'sdocs.config'`.

**Step 3: Write the settings**

`api/sdocs/config.py`:
```python
"""What .env says, read from DOCS_ variables. Step 1 uses the database and
the cookie flag; the rest are here so .env.example is whole from the start,
and so a secret can never be printed by accident (repr=False)."""
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="DOCS_", extra="ignore")

    database_url: str = "postgresql+psycopg://sdocs:sdocs@127.0.0.1:5432/sdocs"

    # The only folder Simple Docs may read code from (step 4). In Compose the
    # host folder named in .env is mounted read-only here; run outside
    # Docker, it is the folder itself.
    repo_root: str = "/repos"

    # Secrets. They stay on the server: none of them is ever sent to the
    # browser, and repr() leaves them out.
    openrouter_api_key: str = Field(default="", repr=False)  # step 3
    github_token: str = Field(default="", repr=False)  # steps 4 and 8
    monkiro_api_key: str = Field(default="", repr=False)  # step 8

    # The session cookie's Secure flag: off for the design's plain
    # http://localhost:8080, on behind https.
    cookie_secure: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_config.py -v`
Expected: `4 passed`.

**Step 5: Commit**

```
git add api/sdocs/config.py api/tests/test_config.py
git commit -m "Read settings from DOCS_ variables and keep the secrets out of repr" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: The health check, the test database and one error shape

**Files:**
- Create: `api/sdocs/db.py`
- Create: `api/sdocs/models/__init__.py`, `api/sdocs/models/base.py`
- Create: `api/sdocs/api/__init__.py` (empty), `api/sdocs/api/errors.py`, `api/sdocs/api/deps.py`, `api/sdocs/api/app.py`, `api/sdocs/api/routes/__init__.py` (empty)
- Test: `api/tests/conftest.py`, `api/tests/test_health.py`, `api/tests/test_errors.py`

**Step 1: Write the failing tests**

`api/tests/conftest.py` (later tasks add to it):
```python
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
def client(engine):
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
```

`api/tests/test_health.py`:
```python
def test_health_answers_ok_once_the_database_is_there(client):
    r = client.get("/v1/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}
```

`api/tests/test_errors.py`:
```python
"""Every error is {"error": {"code", "message", "fields"?}} (the design, §8)."""
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import BaseModel, Field, field_validator

from sdocs.api import errors
from sdocs.api.errors import ApiError


class ThingIn(BaseModel):
    name: str = Field(max_length=10)
    count: int

    @field_validator("name")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Can't be blank.")
        return value


def shaped() -> TestClient:
    app = FastAPI()
    errors.install(app)

    @app.post("/things")
    def add(body: ThingIn):
        return {}

    @app.get("/taken")
    def taken():
        raise ApiError(409, "name_taken", "That name is taken.")

    return TestClient(app)


def test_an_unknown_address_is_a_404_in_the_shape(client):
    r = client.get("/v1/nothing-here")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "not_found",
                                  "message": "There's nothing at this address."}}


def test_one_field_wrong_says_so_in_its_own_words():
    r = shaped().post("/things", json={"name": " ", "count": 1})
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "invalid", "message": "Can't be blank.",
                                  "fields": {"name": "Can't be blank."}}}


def test_several_fields_wrong_are_listed_by_name():
    r = shaped().post("/things", json={"name": "x" * 11})
    body = r.json()["error"]
    assert r.status_code == 422 and body["code"] == "invalid"
    assert body["message"] == "Check the fields marked."
    assert body["fields"]["count"] == "Fill this in."
    assert set(body["fields"]) == {"name", "count"}


def test_an_api_error_keeps_its_status_code_and_message():
    r = shaped().get("/taken")
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "name_taken", "message": "That name is taken."}}


def test_the_wrong_method_is_a_405_in_the_shape():
    r = shaped().get("/things")
    assert r.status_code == 405
    assert r.json()["error"]["code"] == "method_not_allowed"
    assert "POST" in r.headers["allow"]
```

**Step 2: Run them to see them fail**

Run: `cd api && .venv/bin/pytest tests/test_health.py tests/test_errors.py -v`
Expected: ERROR collecting `test_errors.py`, `ModuleNotFoundError: No module named 'sdocs.api'`, and `test_health.py` erroring in the `engine` fixture on `from sdocs.models import Base` (alembic's env.py).

**Step 3: Write the implementation**

`api/sdocs/api/__init__.py`, `api/sdocs/api/routes/__init__.py`: empty files.

`api/sdocs/db.py`:
```python
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from sdocs.config import get_settings


@lru_cache
def get_engine():
    return create_engine(get_settings().database_url, pool_pre_ping=True)


@lru_cache
def get_sessionmaker() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), expire_on_commit=False)
```

`api/sdocs/models/base.py`:
```python
import uuid

from sqlalchemy import DateTime, MetaData, Uuid, func, text
from sqlalchemy.orm import DeclarativeBase, mapped_column

naming = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=naming)


def uuid_pk():
    """Every table's id: a uuid, made by Python or, for a row written by
    hand, by Postgres."""
    return mapped_column(Uuid, primary_key=True, default=uuid.uuid4,
                         server_default=text("gen_random_uuid()"))


def created_at_column():
    return mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
```

`api/sdocs/models/__init__.py` (Task 4 replaces it):
```python
from sdocs.models.base import Base

__all__ = ["Base"]
```

`api/sdocs/api/errors.py`:
```python
"""Every error the API gives has one shape (the design, §8):

    {"error": {"code": "...", "message": "...", "fields": {...}}}

`code` is for programs, `message` is written for people, and `fields` (a
field's name → what is wrong with it) comes only when the request itself had
something wrong in it."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

CHECK_FIELDS = "Check the fields marked."


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str,
                 fields: dict[str, str] | None = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.fields = fields


def body(code: str, message: str, fields: dict[str, str] | None = None) -> dict[str, Any]:
    error: dict[str, Any] = {"code": code, "message": message}
    if fields:
        error["fields"] = fields
    return {"error": error}


def invalid(field: str, message: str) -> ApiError:
    """One field is wrong: a 422 that names it."""
    return ApiError(422, "invalid", message, {field: message})


def not_found(message: str = "There's nothing here by that id.") -> ApiError:
    return ApiError(404, "not_found", message)


def forbidden(message: str = "Your role can't do that. Ask an admin.") -> ApiError:
    return ApiError(403, "forbidden", message)


def commit_unique(db, taken: dict[str, ApiError]) -> None:
    """Commit, as the check before it said was fine. Two requests at once can
    both pass that check; the one that loses to a unique constraint named in
    `taken` gets that constraint's error, as if the check had caught it."""
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        error = taken.get(getattr(getattr(e.orig, "diag", None), "constraint_name", None) or "")
        if error is None:
            raise
        raise error from None


def field_errors(errors) -> dict[str, str]:
    out: dict[str, str] = {}
    for e in errors:
        loc = [str(x) for x in e.get("loc", ()) if x != "body"]
        if e.get("type") == "missing":
            message = "Fill this in."
        else:
            # a check of our own says it plainly, without pydantic's "Value error, "
            message = str(e.get("msg", "Not valid.")).removeprefix("Value error, ")
        out.setdefault(".".join(loc) or "body", message)
    return out


_STATUS = {
    404: ("not_found", "There's nothing at this address."),
    405: ("method_not_allowed", "This address doesn't take that kind of request."),
}


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def _api_error(request: Request, exc: ApiError):
        return JSONResponse(status_code=exc.status,
                            content=body(exc.code, exc.message, exc.fields))

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError):
        fields = field_errors(exc.errors())
        message = next(iter(fields.values())) if len(fields) == 1 else CHECK_FIELDS
        return JSONResponse(status_code=422, content=body("invalid", message, fields))

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException):
        code, message = _STATUS.get(exc.status_code, ("error", str(exc.detail)))
        return JSONResponse(status_code=exc.status_code, content=body(code, message),
                            headers=exc.headers)
```

`api/sdocs/api/deps.py` (Task 7 adds who is calling):
```python
from typing import Annotated

from fastapi import Depends
from sqlalchemy.orm import Session as Db

from sdocs.db import get_sessionmaker


def get_db():
    with get_sessionmaker()() as session:
        yield session


DB = Annotated[Db, Depends(get_db)]
```

`api/sdocs/api/app.py` (each later task adds its router above `app.include_router(v1)`):
```python
import logging

from fastapi import APIRouter, FastAPI
from sqlalchemy import text

from sdocs.api import errors
from sdocs.api.deps import DB

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

app = FastAPI(
    title="Simple Docs",
    version="0.1.0",
    description="Open source, self-hosted documentation generator. The API is the only door.",
    docs_url="/docs",
    redoc_url=None,
)
errors.install(app)

v1 = APIRouter(prefix="/v1")


@v1.get("/health", tags=["system"])
def health(db: DB):
    db.execute(text("select 1"))
    return {"status": "ok"}


app.include_router(v1)
```

**Step 4: Run them to see them pass**

Run: `cd api && .venv/bin/pytest -v`
Expected: `10 passed` (4 config, 1 health, 5 errors).

**Step 5: Commit**

```
git add api/sdocs/db.py api/sdocs/models/__init__.py api/sdocs/models/base.py \
  api/sdocs/api/__init__.py api/sdocs/api/errors.py api/sdocs/api/deps.py api/sdocs/api/app.py \
  api/sdocs/api/routes/__init__.py api/tests/conftest.py api/tests/test_health.py \
  api/tests/test_errors.py
git commit -m "Answer a health check, and give every error one shape: code, message, fields" \
  -m "The tests make and reset a sdocs_test database on the compose db." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: People, sessions, settings and the logo in migration 0001, with `block_change()`

**Files:**
- Create: `api/sdocs/models/users.py`, `api/sdocs/models/settings.py`
- Modify: `api/sdocs/models/__init__.py` (replace)
- Create: `api/alembic/versions/0001_skeleton.py`
- Test: `api/tests/test_migrations.py`, `api/tests/test_kept.py`

**Step 1: Write the failing tests**

`api/tests/test_migrations.py`:
```python
"""A fresh install must work, and so must going back. Runs the migrations
up, down and up again on a database of its own, and checks the models agree."""
import os

import pytest
from alembic import command
from alembic.config import Config
from conftest import TEST_DATABASE_URL
from sqlalchemy import CheckConstraint, create_engine, text

MIGRATION_URL = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/sdocs_migration_check"
TABLES = {"app_user", "session", "setting", "org_logo", "alembic_version"}
TRIGGERS = {"app_user_never_deleted"}


@pytest.fixture
def blank_database(monkeypatch):
    admin = TEST_DATABASE_URL.rsplit("/", 1)[0] + "/postgres"
    name = MIGRATION_URL.rsplit("/", 1)[1]
    engine = create_engine(admin, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f'drop database if exists "{name}" with (force)'))
        conn.execute(text(f'create database "{name}"'))
    engine.dispose()
    # alembic/env.py prefers this over the ini, so point it at the blank one
    monkeypatch.setenv("DOCS_DATABASE_URL", MIGRATION_URL)
    yield MIGRATION_URL
    engine = create_engine(admin, isolation_level="AUTOCOMMIT")
    with engine.connect() as conn:
        conn.execute(text(f'drop database if exists "{name}" with (force)'))
    engine.dispose()


def alembic_config(url: str) -> Config:
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("sqlalchemy.url", url)
    cfg.attributes["configure_logger"] = False
    return cfg


def _one_column(engine, sql: str) -> set[str]:
    with engine.connect() as conn:
        return set(conn.execute(text(sql)).scalars())


def _tables(engine) -> set[str]:
    return _one_column(engine, "select table_name from information_schema.tables "
                               "where table_schema = 'public'")


def _functions(engine) -> set[str]:
    return _one_column(engine, "select p.proname from pg_proc p join pg_namespace n "
                               "on n.oid = p.pronamespace where n.nspname = 'public'")


def test_migrations_go_up_down_and_up_again(blank_database):
    cfg = alembic_config(blank_database)
    engine = create_engine(blank_database)

    command.upgrade(cfg, "head")
    assert _tables(engine) == TABLES
    assert "block_change" in _functions(engine)
    assert _one_column(engine, "select tgname from pg_trigger where not tgisinternal") == TRIGGERS

    command.downgrade(cfg, "base")
    assert _tables(engine) == {"alembic_version"}
    assert "block_change" not in _functions(engine)
    assert _one_column(engine, "select tgname from pg_trigger where not tgisinternal") == set()

    command.upgrade(cfg, "head")
    assert _tables(engine) == TABLES
    engine.dispose()


def test_the_models_match_the_migrations(blank_database):
    """No drift: what the models say is what a fresh database gets."""
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from sdocs.models import Base

    command.upgrade(alembic_config(blank_database), "head")
    engine = create_engine(blank_database)
    with engine.connect() as conn:
        context = MigrationContext.configure(conn, opts={"compare_server_default": True})
        diff = compare_metadata(context, Base.metadata)
    # compare_metadata does not look at check constraints, so compare their names
    in_database = _one_column(engine, "select c.conname from pg_constraint c join pg_namespace n "
                                      "on n.oid = c.connamespace "
                                      "where c.contype = 'c' and n.nspname = 'public'")
    engine.dispose()
    assert diff == [], f"the models and the migrations disagree: {diff}"
    in_models = {str(c.name) for t in Base.metadata.sorted_tables for c in t.constraints
                 if isinstance(c, CheckConstraint)}
    assert in_models == in_database
```

`api/tests/test_kept.py`:
```python
"""block_change() keeps rows as they are. Step 2's document_version uses it
for UPDATE and DELETE (append-only); app_user uses it for DELETE now, because
people are deactivated, never deleted (rule 1)."""
import re
from datetime import UTC, datetime

import pytest
from sqlalchemy import delete, select, text, update
from sqlalchemy.exc import DBAPIError

from sdocs.models import ROLES, AppUser, UserSession


def _scratch(db):
    """A throwaway table guarded the way an append-only table will be."""
    db.execute(text("create temp table scratch (n int)"))
    db.execute(text("create trigger scratch_kept before update or delete on scratch "
                    "for each row execute function block_change()"))
    db.execute(text("insert into scratch values (1)"))


def test_an_update_is_refused(db):
    _scratch(db)
    with pytest.raises(DBAPIError, match="UPDATE on scratch is not allowed"):
        db.execute(text("update scratch set n = 2"))


def test_a_delete_is_refused(db):
    _scratch(db)
    with pytest.raises(DBAPIError, match="DELETE on scratch is not allowed"):
        db.execute(text("delete from scratch"))


def test_truncate_still_clears_a_table_for_the_tests(db):
    _scratch(db)
    db.execute(text("truncate scratch"))
    assert db.execute(text("select count(*) from scratch")).scalar() == 0


def test_a_person_is_deactivated_never_deleted(db):
    db.add(AppUser(username="kim", password_hash="x", display_name="Kim Lee", role="editor"))
    db.commit()
    with pytest.raises(DBAPIError, match="DELETE on app_user is not allowed"):
        db.execute(delete(AppUser))
    db.rollback()
    db.execute(update(AppUser).values(active=False))
    db.commit()
    assert db.execute(select(AppUser.active)).scalar_one() is False


def test_the_database_keeps_usernames_lower_case_and_roles_known(db):
    with pytest.raises(DBAPIError, match="ck_app_user_username_lower"):
        db.add(AppUser(username="Kim", password_hash="x", display_name="Kim", role="editor"))
        db.flush()
    db.rollback()
    with pytest.raises(DBAPIError, match="ck_app_user_role"):
        db.add(AppUser(username="kim", password_hash="x", display_name="Kim", role="owner"))
        db.flush()


def test_the_roles_the_code_knows_are_the_roles_the_database_allows(db):
    check = db.execute(text("select pg_get_constraintdef(oid) from pg_constraint "
                            "where conname = 'ck_app_user_role'")).scalar_one()
    assert set(re.findall(r"'(\w+)'", check)) == set(ROLES)


def test_a_person_added_by_hand_is_active_with_no_failed_attempts(db):
    row = db.execute(text("insert into app_user (username, password_hash, display_name, role) "
                          "values ('kim', 'x', 'Kim', 'editor') "
                          "returning active, failed_attempts")).one()
    assert (row.active, row.failed_attempts) == (True, 0)


def test_a_session_keeps_a_whole_sha256(db):
    kim = AppUser(username="kim", password_hash="x", display_name="Kim", role="editor")
    db.add(kim)
    db.flush()
    now = datetime.now(UTC)
    with pytest.raises(DBAPIError, match="ck_session_token_hash_sha256"):
        db.add(UserSession(created_by=kim.id, token_hash="abc", last_seen_at=now, expires_at=now))
        db.flush()
```

**Step 2: Run them to see them fail**

Run: `cd api && .venv/bin/pytest tests/test_migrations.py tests/test_kept.py -v`
Expected: ERROR collecting `test_kept.py`, `ImportError: cannot import name 'AppUser' from 'sdocs.models'`; `test_migrations.py` FAILS with `assert {'alembic_version'} == {...}`.

**Step 3: Write the models and the migration**

`api/sdocs/models/users.py`:
```python
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, true
from sqlalchemy.orm import Mapped, mapped_column

from sdocs.models.base import Base, created_at_column, uuid_pk

ROLES = ("admin", "editor", "reviewer")


class AppUser(Base):
    """Someone who signs in. Deactivated, never deleted: a trigger refuses a
    DELETE, so documents keep their authors and reviewers (rule 1)."""

    __tablename__ = "app_user"
    __table_args__ = (
        CheckConstraint("username = lower(username)", name="username_lower"),
        CheckConstraint("role in ('admin', 'editor', 'reviewer')", name="role"),
        CheckConstraint("failed_attempts >= 0", name="failed_attempts"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # kept lower case, matched however it is typed
    username: Mapped[str] = mapped_column(String(64), unique=True)
    # argon2id (sdocs/services/access.py); never the password
    password_hash: Mapped[str] = mapped_column(String(200))
    display_name: Mapped[str] = mapped_column(String(120))
    role: Mapped[str] = mapped_column(String(16))
    active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=true())
    # wrong passwords in a row; five lock the password until locked_until
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sign_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = created_at_column()
    # who added them; null for the first admin (first run) and the command line
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))


class UserSession(Base):
    """One signed-in browser (or script with a cookie jar). Only the token's
    SHA-256 is kept. Ends 12 hours after its last request, 14 days after
    sign-in whatever happens, on sign-out, on a new password and on
    deactivation (sdocs/services/sessions.py)."""

    __tablename__ = "session"
    __table_args__ = (CheckConstraint("length(token_hash) = 64", name="token_hash_sha256"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = created_at_column()
    # the person who signed in: whose session it is
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"), index=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
```

`api/sdocs/models/settings.py`:
```python
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from sdocs.models.base import Base, created_at_column, uuid_pk


class Setting(Base):
    """A setting changed in the app: a key and a JSON value, changed in
    place (configuration, not history). Step 1's keys are the organisation's
    details: org.name, org.abn, org.phone, org.email, org.address, and
    org.logo (the id of the org_logo row in use)."""

    __tablename__ = "setting"

    id: Mapped[uuid.UUID] = uuid_pk()
    key: Mapped[str] = mapped_column(String(64), unique=True)
    value: Mapped[Any] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = created_at_column()
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False,
                                                 server_default=func.now())
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("app_user.id"))


class OrgLogo(Base):
    """The organisation's logo, in the database (bytea) so one pg_dump is a
    whole backup. An upload is a new row; setting org.logo names the one in
    use. PNG or JPEG, 512 KB at most."""

    __tablename__ = "org_logo"
    __table_args__ = (
        CheckConstraint("mime in ('image/png', 'image/jpeg')", name="mime"),
        CheckConstraint("octet_length(content) <= 524288", name="size"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    mime: Mapped[str] = mapped_column(String(32))
    content: Mapped[bytes] = mapped_column(LargeBinary)
    created_at: Mapped[datetime] = created_at_column()
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("app_user.id"))
```

`api/sdocs/models/__init__.py` (replace):
```python
from sdocs.models.base import Base
from sdocs.models.settings import OrgLogo, Setting
from sdocs.models.users import ROLES, AppUser, UserSession

__all__ = ["ROLES", "AppUser", "Base", "OrgLogo", "Setting", "UserSession"]
```

`api/alembic/versions/0001_skeleton.py`:
```python
"""skeleton: people, sessions, settings, the logo, and block_change()

Revision ID: 0001
Revises:
Create Date: 2026-10-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _id() -> sa.Column:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"),
                     nullable=False)


def _created_at() -> sa.Column:
    return sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                     nullable=False)


def upgrade() -> None:
    op.create_table(
        "app_user",
        _id(),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password_hash", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("failed_attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("locked_until", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sign_in_at", sa.DateTime(timezone=True), nullable=True),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint("username = lower(username)", name=op.f("ck_app_user_username_lower")),
        sa.CheckConstraint("role in ('admin', 'editor', 'reviewer')",
                           name=op.f("ck_app_user_role")),
        sa.CheckConstraint("failed_attempts >= 0", name=op.f("ck_app_user_failed_attempts")),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_app_user_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_app_user")),
        sa.UniqueConstraint("username", name=op.f("uq_app_user_username")),
    )
    op.create_table(
        "session",
        _id(),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("length(token_hash) = 64", name=op.f("ck_session_token_hash_sha256")),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_session_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_session")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_session_token_hash")),
    )
    op.create_index(op.f("ix_session_created_by"), "session", ["created_by"])
    op.create_table(
        "setting",
        _id(),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"),
                  nullable=False),
        sa.Column("updated_by", sa.Uuid(), nullable=True),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_setting_created_by_app_user")),
        sa.ForeignKeyConstraint(["updated_by"], ["app_user.id"],
                                name=op.f("fk_setting_updated_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_setting")),
        sa.UniqueConstraint("key", name=op.f("uq_setting_key")),
    )
    op.create_table(
        "org_logo",
        _id(),
        sa.Column("mime", sa.String(length=32), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
        _created_at(),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.CheckConstraint("mime in ('image/png', 'image/jpeg')", name=op.f("ck_org_logo_mime")),
        sa.CheckConstraint("octet_length(content) <= 524288", name=op.f("ck_org_logo_size")),
        sa.ForeignKeyConstraint(["created_by"], ["app_user.id"],
                                name=op.f("fk_org_logo_created_by_app_user")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_org_logo")),
    )

    # Rows that are kept as they are. One function for every such table:
    # step 2's document_version refuses UPDATE and DELETE (append-only);
    # app_user refuses DELETE (people are deactivated, never deleted).
    # TRUNCATE is neither, so the tests can still clear the tables.
    op.execute("""
        create or replace function block_change() returns trigger
        language plpgsql as $$
        begin
            raise exception '% on % is not allowed: rows here are kept as they are',
                tg_op, tg_table_name
                using errcode = 'restrict_violation';
        end
        $$
    """)
    op.execute("create trigger app_user_never_deleted before delete on app_user "
               "for each row execute function block_change()")


def downgrade() -> None:
    op.execute("drop trigger if exists app_user_never_deleted on app_user")
    op.execute("drop function if exists block_change()")
    op.drop_table("org_logo")
    op.drop_table("setting")
    op.drop_index(op.f("ix_session_created_by"), table_name="session")
    op.drop_table("session")
    op.drop_table("app_user")
```

**Step 4: Run them to see them pass**

Run: `cd api && .venv/bin/pytest tests/test_migrations.py tests/test_kept.py -v`
Expected: `10 passed`.

Then the whole suite (the session fixture now builds the new tables):
Run: `cd api && .venv/bin/pytest -q`
Expected: `20 passed`.

**Step 5: Commit**

```
git add api/sdocs/models/users.py api/sdocs/models/settings.py api/sdocs/models/__init__.py \
  api/alembic/versions/0001_skeleton.py api/tests/test_migrations.py api/tests/test_kept.py
git commit -m "Add people, sessions, settings and the logo, and block_change() for rows kept as they are" \
  -m "app_user uses it for DELETE now; step 2's document_version will use it for UPDATE and DELETE." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 5: Passwords as argon2id hashes

**Files:**
- Create: `api/sdocs/services/__init__.py` (empty), `api/sdocs/services/access.py`
- Test: `api/tests/test_access.py`

**Step 1: Write the failing test**

`api/tests/test_access.py`:
```python
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
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_access.py -v`
Expected: ERROR collecting, `ModuleNotFoundError: No module named 'sdocs.services'`.

**Step 3: Write the implementation**

`api/sdocs/services/__init__.py`: empty file.

`api/sdocs/services/access.py`:
```python
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
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_access.py -v`
Expected: `5 passed`.

**Step 5: Commit**

```
git add api/sdocs/services/__init__.py api/sdocs/services/access.py api/tests/test_access.py
git commit -m "Keep passwords as argon2id hashes, with a dummy hash for an unknown username" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Sessions kept as a hash, 12 hours idle and 14 days in all, and each role's scopes

**Files:**
- Create: `api/sdocs/services/sessions.py`
- Modify: `api/tests/conftest.py` (append people)
- Test: `api/tests/test_sessions.py`

**Step 1: Write the failing test**

Append to `api/tests/conftest.py`:
```python


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
```

`api/tests/test_sessions.py`:
```python
import hashlib
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from sdocs.models import ROLES, UserSession
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
    last = NOW + timedelta(hours=11, minutes=59, seconds=59)
    assert sessions.find(db, raw, last) is not None
    # exactly 12 hours after it was last seen, it has ended
    assert sessions.find(db, raw, last + sessions.IDLE) is None


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
    sessions.end(db, one, NOW)
    db.commit()
    ended = db.execute(select(UserSession).where(UserSession.revoked_at.is_not(None))).scalar_one()
    assert ended.revoked_at == NOW
    assert sessions.find(db, one, NOW) is None
    assert sessions.find(db, two, NOW) is not None


def test_ending_all_of_someones_sessions_can_keep_this_one(db, editor, admin):
    this = sessions.start(db, editor, NOW)
    other = sessions.start(db, editor, NOW)
    admins = sessions.start(db, admin, NOW)
    db.commit()
    sessions.end_all(db, editor, keep=sessions.find(db, this, NOW), now=NOW)
    db.commit()
    ended = db.execute(select(UserSession).where(UserSession.revoked_at.is_not(None))).scalar_one()
    assert ended.revoked_at == NOW
    assert sessions.find(db, this, NOW) is not None
    assert sessions.find(db, other, NOW) is None
    assert sessions.find(db, admins, NOW) is not None
    sessions.end_all(db, editor)
    db.commit()
    assert sessions.find(db, this, NOW) is None


def test_each_role_has_its_scopes():
    assert sessions.scopes_for("admin") == ["*"]
    # editors approve someone else's version too; reviewers approve but never edit
    assert sessions.scopes_for("editor") == ["documents:read", "documents:write",
                                             "clients:read", "clients:write",
                                             "reviews:write"]
    assert sessions.scopes_for("reviewer") == ["documents:read", "clients:read",
                                               "reviews:write"]
    assert sessions.scopes_for("owner") == []


def test_every_role_has_a_scopes_entry_and_nothing_else_does():
    assert set(sessions.SCOPES) == set(ROLES)
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_sessions.py -v`
Expected: ERROR collecting, `ImportError: cannot import name 'sessions' from 'sdocs.services'`.

**Step 3: Write the implementation**

`api/sdocs/services/sessions.py`:
```python
"""Sessions: one random token per signed-in browser, kept only as its
SHA-256. A session ends 12 hours after its last request (sliding), 14 days
after sign-in whatever happens, on sign-out, when the person's password is
set anew (their other sessions), and when they are deactivated (all)."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session as Db

from sdocs.models import AppUser, UserSession

PREFIX = "sdocs_s."
IDLE = timedelta(hours=12)
LIFETIME = timedelta(days=14)
# last_seen_at is written at most once a minute, not on every request
TOUCH_EVERY = timedelta(minutes=1)

# What each role may do (the design's screens table). Users, settings,
# templates and spend are admin-only: the admin's "*" alone. Later steps
# check the others, and add to these lists when they need to.
SCOPES: dict[str, list[str]] = {
    "reviewer": ["documents:read", "clients:read", "reviews:write"],
    # editors approve someone else's version too (nobody approves their own)
    "editor": ["documents:read", "documents:write", "clients:read", "clients:write",
               "reviews:write"],
    "admin": ["*"],
}


def scopes_for(role: str) -> list[str]:
    return list(SCOPES.get(role, []))


def _hash(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def start(db: Db, user: AppUser, now: datetime | None = None) -> str:
    """A new session; the raw token is returned once and never stored."""
    now = now or datetime.now(UTC)
    raw = PREFIX + secrets.token_urlsafe(32)
    db.add(UserSession(created_by=user.id, token_hash=_hash(raw), last_seen_at=now,
                       expires_at=now + LIFETIME))
    db.flush()
    return raw


def find(db: Db, raw: str, now: datetime | None = None) -> UserSession | None:
    """The live session for this token, marked as just used; None if it is
    not ours, ended, too old or idle too long."""
    if not raw.startswith(PREFIX):
        return None
    now = now or datetime.now(UTC)
    row = db.execute(
        select(UserSession).where(UserSession.token_hash == _hash(raw))
    ).scalar_one_or_none()
    if (row is None or row.revoked_at is not None or row.expires_at <= now
            or now - row.last_seen_at >= IDLE):
        return None
    if now - row.last_seen_at >= TOUCH_EVERY:
        row.last_seen_at = now
        db.flush()
    return row


def end(db: Db, raw: str, now: datetime | None = None) -> None:
    db.execute(update(UserSession).where(UserSession.token_hash == _hash(raw),
                                         UserSession.revoked_at.is_(None))
               .values(revoked_at=now or datetime.now(UTC)))
    db.flush()


def end_all(db: Db, user: AppUser, keep: UserSession | None = None,
            now: datetime | None = None) -> None:
    """End every session of this person, but `keep` (the one asking) if given."""
    q = update(UserSession).where(UserSession.created_by == user.id,
                                  UserSession.revoked_at.is_(None))
    if keep is not None:
        q = q.where(UserSession.id != keep.id)
    db.execute(q.values(revoked_at=now or datetime.now(UTC)))
    db.flush()
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_sessions.py -v`
Expected: `10 passed`.

**Step 5: Commit**

```
git add api/sdocs/services/sessions.py api/tests/conftest.py api/tests/test_sessions.py
git commit -m "Keep sessions as a token's hash: 12 hours idle, 14 days in all, and each role's scopes" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Sign in, sign out and who am I, with the session in an httpOnly cookie

**Files:**
- Modify: `api/sdocs/api/deps.py` (replace)
- Create: `api/sdocs/api/routes/auth.py`
- Modify: `api/sdocs/api/app.py` (include the router)
- Modify: `api/tests/conftest.py` (append sign-in helpers)
- Test: `api/tests/test_auth.py`

**Step 1: Write the failing test**

Append to `api/tests/conftest.py`:
```python


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
```

`api/tests/test_auth.py`:
```python
from datetime import UTC, datetime, timedelta

from conftest import PASSWORD, all_at_once, fresh_client, make_user, sign_in
from sqlalchemy import select, update

from sdocs.models import AppUser, UserSession

WRONG = {"error": {"code": "wrong_password", "message": "Wrong username or password."}}


def _try(client, username: str, password: str):
    return client.post("/v1/auth/sign-in", json={"username": username, "password": password})


def test_signing_in_sets_a_cookie_only_the_browser_can_read(client, editor):
    r = _try(client, " Mel ", PASSWORD)
    assert r.status_code == 200
    assert r.json() == {"id": str(editor.id), "username": "mel", "display_name": "Mel Grant",
                        "role": "editor",
                        "scopes": ["documents:read", "documents:write", "clients:read",
                                   "clients:write", "reviews:write"]}
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("sdocs_session=sdocs_s.")
    lowered = cookie.lower()
    assert "httponly" in lowered and "samesite=strict" in lowered and "path=/" in lowered
    # plain http://localhost by default (DOCS_COOKIE_SECURE)
    assert "; secure" not in lowered
    # the token is in the cookie only, never in what a page's script can read
    assert "sdocs_s." not in r.text


def test_the_cookie_says_who_you_are(client, reviewer):
    sign_in(client, "sam")
    me = client.get("/v1/auth/me")
    assert me.status_code == 200
    assert me.json()["display_name"] == "Sam Vu" and me.json()["role"] == "reviewer"


def test_no_cookie_is_signed_out(client):
    r = client.get("/v1/auth/me")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "signed_out",
                                  "message": "You're signed out. Sign in again."}}


def test_a_wrong_password_and_an_unknown_username_look_alike(client, editor):
    wrong = _try(client, "mel", "nope")
    unknown = _try(client, "nobody", "nope")
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json() == WRONG


def test_a_deactivated_person_cannot_sign_in(client, db):
    make_user(db, "old", "Old Timer", active=False)
    r = _try(client, "old", PASSWORD)
    assert r.status_code == 401 and r.json() == WRONG


def test_five_wrong_passwords_lock_it_for_15_minutes(client, db, editor):
    for _ in range(4):
        assert _try(client, "mel", "nope").json() == WRONG
    r = _try(client, "mel", "nope")
    assert r.status_code == 401
    assert r.json() == {"error": {"code": "locked", "message":
                                  "Too many wrong passwords. Try again in 15 minutes."}}
    assert _try(client, "mel", PASSWORD).json()["error"]["code"] == "locked"
    # 15 minutes on, the right password works and the count starts again
    db.execute(update(AppUser).values(locked_until=datetime.now(UTC) - timedelta(seconds=1)))
    db.commit()
    assert _try(client, "mel", PASSWORD).status_code == 200
    db.refresh(editor)
    assert editor.failed_attempts == 0 and editor.locked_until is None


def test_a_right_password_clears_the_count(client, db, editor):
    _try(client, "mel", "nope")
    sign_in(client, "mel")
    db.refresh(editor)
    assert editor.failed_attempts == 0 and editor.last_sign_in_at is not None


def test_a_hash_with_weaker_settings_is_replaced_at_sign_in(client, db, editor):
    from argon2 import PasswordHasher

    from sdocs.services import access

    editor.password_hash = PasswordHasher(time_cost=1, memory_cost=8, parallelism=1).hash(PASSWORD)
    db.commit()
    sign_in(client, "mel")
    db.refresh(editor)
    assert not access.needs_rehash(editor.password_hash)
    assert access.verify_password(PASSWORD, editor.password_hash)


def test_wrong_passwords_sent_all_at_once_still_lock_after_five(client, editor):
    def guess():
        return _try(fresh_client(), "mel", "nope").json()["error"]["code"]

    codes = all_at_once(8, guess)
    assert codes.count("wrong_password") == 4 and codes.count("locked") == 4


def test_signing_out_ends_the_session(client, editor):
    sign_in(client, "mel")
    token = client.cookies["sdocs_session"]
    r = client.post("/v1/auth/sign-out")
    assert r.status_code == 204
    assert "sdocs_session=" in r.headers["set-cookie"] and "max-age=0" in r.headers["set-cookie"].lower()
    assert client.get("/v1/auth/me").status_code == 401
    # the old token is no good either, even if something kept it
    assert client.get("/v1/auth/me", headers={"Cookie": f"sdocs_session={token}"}).status_code == 401
    # again, or with no session at all, is still fine
    assert client.post("/v1/auth/sign-out").status_code == 204


def test_signing_in_again_ends_the_session_the_browser_had(client, editor, reviewer):
    sign_in(client, "mel")
    old = client.cookies["sdocs_session"]
    sign_in(client, "sam")
    assert client.get("/v1/auth/me").json()["username"] == "sam"
    assert fresh_client().get("/v1/auth/me",
                              headers={"Cookie": f"sdocs_session={old}"}).status_code == 401


def test_with_secure_cookies_on_both_cookies_say_secure(monkeypatch, client, editor):
    from sdocs.config import get_settings

    monkeypatch.setenv("DOCS_COOKIE_SECURE", "true")
    get_settings.cache_clear()
    try:
        r = _try(client, "mel", PASSWORD)
        assert "; secure" in r.headers["set-cookie"].lower()
        out = client.post("/v1/auth/sign-out")
        assert "; secure" in out.headers["set-cookie"].lower()
    finally:
        monkeypatch.delenv("DOCS_COOKIE_SECURE")
        get_settings.cache_clear()


def test_a_lock_is_logged(client, editor, caplog):
    with caplog.at_level("INFO", logger="sdocs"):
        for _ in range(5):
            _try(client, "mel", "nope")
    assert "sign-in locked for mel" in caplog.text


def test_a_request_keeps_the_session_fresh(client, db, editor):
    sign_in(client, "mel")
    then = datetime.now(UTC) - timedelta(minutes=2)
    db.execute(update(UserSession).values(last_seen_at=then))
    db.commit()
    assert client.get("/v1/auth/me").status_code == 200
    row = db.execute(select(UserSession)).scalar_one()
    db.refresh(row)
    assert row.last_seen_at > then + timedelta(minutes=1)


def test_12_hours_without_a_request_signs_you_out(client, db, editor):
    sign_in(client, "mel")
    db.execute(update(UserSession).values(last_seen_at=datetime.now(UTC) - timedelta(hours=12, minutes=1)))
    db.commit()
    assert client.get("/v1/auth/me").json()["error"]["code"] == "signed_out"


def test_a_deactivated_persons_session_stops_working(client, db, editor):
    sign_in(client, "mel")
    db.execute(update(AppUser).values(active=False))
    db.commit()
    assert client.get("/v1/auth/me").status_code == 401


def test_a_scope_is_held_exactly_by_its_area_or_by_everything():
    from sdocs.api.deps import Principal

    def holds(scopes: list[str], scope: str) -> bool:
        return Principal(user=None, session=None, scopes=scopes).has_scope(scope)  # type: ignore[arg-type]

    assert holds(["*"], "users:write")
    assert holds(["documents:*"], "documents:write")
    assert holds(["documents:read"], "documents:read")
    assert not holds(["documents:read"], "documents:write")
    assert not holds(["documents:*"], "clients:read")
    assert not holds([], "documents:read")
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_auth.py -v`
Expected: FAIL, every test that signs in gets `404` (`assert 404 == 200`), and `test_no_cookie_is_signed_out` gets `{"error": {"code": "not_found", ...}}`.

**Step 3: Write the implementation**

`api/sdocs/api/deps.py` (replace):
```python
from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated

from fastapi import Cookie, Depends
from sqlalchemy.orm import Session as Db

from sdocs.api.errors import ApiError, forbidden
from sdocs.db import get_sessionmaker
from sdocs.models import AppUser, UserSession
from sdocs.services import sessions

COOKIE = "sdocs_session"


def get_db():
    with get_sessionmaker()() as session:
        yield session


DB = Annotated[Db, Depends(get_db)]


@dataclass(slots=True)
class Principal:
    """Whoever is calling: a person with a live session."""

    user: AppUser
    session: UserSession
    scopes: list[str]

    def has_scope(self, scope: str) -> bool:
        area = scope.split(":")[0]
        return "*" in self.scopes or scope in self.scopes or f"{area}:*" in self.scopes


def signed_out() -> ApiError:
    return ApiError(401, "signed_out", "You're signed out. Sign in again.")


def get_principal(db: DB,
                  token: Annotated[str | None, Cookie(alias=COOKIE)] = None) -> Principal:
    row = sessions.find(db, token) if token else None
    user = db.get(AppUser, row.created_by) if row else None
    if row is None or user is None or not user.active:
        raise signed_out()
    db.commit()  # keeps the touch on last_seen_at
    return Principal(user=user, session=row, scopes=sessions.scopes_for(user.role))


Who = Annotated[Principal, Depends(get_principal)]


def require(scope: str):
    """Dependency: the caller must carry this scope. Use it as
    `who: Annotated[Principal, require("users:write")]`."""

    def _check(who: Who) -> Principal:
        if not who.has_scope(scope):
            raise forbidden()
        return who

    return Depends(_check)
```

`api/sdocs/api/routes/auth.py`:
```python
"""Sign in with a username and password. The session token goes into an
httpOnly, SameSite=Strict cookie and nowhere else: the desktop's scripts
never see it, and a script of your own keeps it in a cookie jar."""
from __future__ import annotations

import logging
import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from sdocs.api.deps import COOKIE, DB, Who
from sdocs.api.errors import ApiError
from sdocs.config import get_settings
from sdocs.models import AppUser
from sdocs.services import access, sessions

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger("sdocs")

TRIES = 5
LOCK = timedelta(minutes=15)


class SignInIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(max_length=200)
    password: str = Field(max_length=access.MAX_PASSWORD)


class MeOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: str
    scopes: list[str]


def me_out(user: AppUser) -> MeOut:
    return MeOut(id=user.id, username=user.username, display_name=user.display_name,
                 role=user.role, scopes=sessions.scopes_for(user.role))


def wrong_password() -> ApiError:
    return ApiError(401, "wrong_password", "Wrong username or password.")


def locked() -> ApiError:
    return ApiError(401, "locked", "Too many wrong passwords. Try again in 15 minutes.")


def signed_in(db, user: AppUser, response: Response) -> MeOut:
    """A new session for this person, committed, its token set as the cookie."""
    raw = sessions.start(db, user)
    user.last_sign_in_at = datetime.now(UTC)
    db.commit()
    response.set_cookie(COOKIE, raw, max_age=int(sessions.LIFETIME.total_seconds()),
                        path="/", httponly=True, samesite="strict",
                        secure=get_settings().cookie_secure)
    return me_out(user)


@router.post("/sign-in", response_model=MeOut)
def sign_in(body: SignInIn, db: DB, response: Response,
            token: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    """Five wrong passwords lock the password for 15 minutes. Signing in ends
    the session this browser had, so a replaced cookie leaves nothing live."""
    # the row stays locked until this attempt is counted, so guesses sent all
    # at once are weighed one after another and cannot get past the limit
    user = db.execute(select(AppUser).where(AppUser.username == body.username.strip().lower())
                      .with_for_update()).scalar_one_or_none()
    now = datetime.now(UTC)
    if user is None or not user.active:
        # an unknown username and a wrong password look alike, and take as long
        access.verify_password(body.password, access.DUMMY_HASH)
        raise wrong_password()
    if user.locked_until is not None and user.locked_until > now:
        # as long as a real attempt, so the reply's timing says no more than its code
        access.verify_password(body.password, access.DUMMY_HASH)
        raise locked()
    if not access.verify_password(body.password, user.password_hash):
        user.failed_attempts += 1
        if user.failed_attempts >= TRIES:
            user.failed_attempts = 0
            user.locked_until = now + LOCK
            db.commit()
            log.info("sign-in locked for %s", user.username)
            raise locked()
        db.commit()
        # no tries-left count: an unknown username could not say it without giving itself away
        raise wrong_password()
    if access.needs_rehash(user.password_hash):
        # made with weaker argon2 settings than today's: replace it while we have the password
        user.password_hash = access.hash_password(body.password)
    user.failed_attempts = 0
    user.locked_until = None
    if token:
        sessions.end(db, token)
    return signed_in(db, user, response)


@router.post("/sign-out", status_code=204)
def sign_out(db: DB, token: Annotated[str | None, Cookie(alias=COOKIE)] = None):
    """Ends this session and clears the cookie. A 204 even with no session."""
    if token:
        sessions.end(db, token)
        db.commit()
    response = Response(status_code=204)
    response.delete_cookie(COOKIE, path="/", httponly=True, samesite="strict",
                           secure=get_settings().cookie_secure)
    return response


@router.get("/me", response_model=MeOut)
def me(who: Who):
    return me_out(who.user)
```

In `api/sdocs/api/app.py`, import the router and include it before `app.include_router(v1)`:
```python
from sdocs.api.routes import auth
```
```python
v1.include_router(auth.router)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_auth.py -v`
Expected: `17 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/deps.py api/sdocs/api/routes/auth.py api/sdocs/api/app.py \
  api/tests/conftest.py api/tests/test_auth.py
git commit -m "Sign in with a username and password into an httpOnly, SameSite=Strict cookie" \
  -m "Five wrong passwords lock it for 15 minutes, counted one at a time; an unknown username looks and takes as long as a wrong password." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: A request that changes something must carry `X-Simple-Docs: 1`

**Files:**
- Create: `api/sdocs/api/guard.py`
- Modify: `api/sdocs/api/app.py` (add the middleware)
- Test: `api/tests/test_guard.py`

**Step 1: Write the failing test**

`api/tests/test_guard.py`:
```python
"""SameSite=Strict keeps other sites' requests from carrying the cookie, but
every other app on localhost is the same site. A page can't add a header of
its own to another origin's request without the browser asking first, and
this API never answers that question, so the header closes the gap."""
from conftest import PASSWORD, sign_in
from fastapi.testclient import TestClient

from sdocs.api.app import app

REFUSED = {"error": {"code": "header_required", "message":
                     "A request that changes something needs the header X-Simple-Docs: 1."}}


def test_a_change_without_the_header_is_refused(engine, editor):
    bare = TestClient(app)
    r = bare.post("/v1/auth/sign-in", json={"username": "mel", "password": PASSWORD})
    assert r.status_code == 403 and r.json() == REFUSED
    for method in ("put", "patch", "delete"):
        assert getattr(bare, method)("/v1/anything").json() == REFUSED


def test_any_other_value_or_method_is_refused(engine):
    bare = TestClient(app)
    assert bare.post("/v1/auth/sign-out", headers={"X-Simple-Docs": "0"}).json() == REFUSED
    assert bare.request("PROPFIND", "/v1/anything").json() == REFUSED


def test_reading_needs_no_header(engine):
    bare = TestClient(app)
    assert bare.get("/v1/health").status_code == 200
    assert bare.head("/v1/health").status_code != 403
    assert bare.options("/v1/health").status_code != 403


def test_with_the_header_it_goes_through(client, editor):
    assert sign_in(client, "mel")["username"] == "mel"
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_guard.py -v`
Expected: FAIL in `test_a_change_without_the_header_is_refused`: `assert 200 == 403`.

**Step 3: Write the implementation**

`api/sdocs/api/guard.py`:
```python
"""A request that changes something must carry X-Simple-Docs: 1. The
session cookie is SameSite=Strict, but every other app on this machine's
localhost counts as the same site; a page can't add this header to a request
for another origin without a CORS preflight, which this API never answers.
Reading (GET, HEAD, OPTIONS) needs no header; every other method does.

Browsers send localhost's cookies to every port on localhost, so any other
server running on this machine sees the session cookie. That is fine for one
person's own machine; for anything more, serve Simple Docs on its own
hostname over https with DOCS_COOKIE_SECURE=true."""
from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from sdocs.api.errors import body

HEADER = b"x-simple-docs"
SAFE = {"GET", "HEAD", "OPTIONS"}


class SameSiteOnly:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope["method"] not in SAFE:
            if dict(scope["headers"]).get(HEADER) != b"1":
                response = JSONResponse(status_code=403, content=body(
                    "header_required",
                    "A request that changes something needs the header X-Simple-Docs: 1."))
                await response(scope, receive, send)
                return
        await self.app(scope, receive, send)
```

In `api/sdocs/api/app.py`, after `errors.install(app)`:
```python
from sdocs.api.guard import SameSiteOnly
```
```python
app.add_middleware(SameSiteOnly)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest -q`
Expected: `47 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/guard.py api/sdocs/api/app.py api/tests/test_guard.py
git commit -m "Refuse a change that doesn't carry X-Simple-Docs: 1" \
  -m "Closes what SameSite=Strict leaves open: other apps on localhost are the same site." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: First run: the first admin and the organisation's name, then never again

**Files:**
- Create: `api/sdocs/services/settings.py`
- Create: `api/sdocs/api/schemas.py`
- Create: `api/sdocs/api/routes/setup.py`
- Modify: `api/sdocs/api/app.py` (include the router)
- Test: `api/tests/test_setup.py`

**Step 1: Write the failing test**

`api/tests/test_setup.py`:
```python
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
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_setup.py -v`
Expected: FAIL, `assert 404 == 201` and the like: `/v1/branding` and `/v1/setup` don't exist yet.

**Step 3: Write the implementation**

`api/sdocs/services/settings.py`:
```python
"""Settings kept in the database (`setting` rows) and changed in the app.
Step 1 has the organisation's details; later steps add their own keys
(models, budget, caps, ignore and redaction patterns, connectors)."""
from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session as Db

from sdocs.models import AppUser, Setting

ORG_NAME = "org.name"
ORG_LOGO = "org.logo"
ORG_KEYS = (ORG_NAME, "org.abn", "org.phone", "org.email", "org.address", ORG_LOGO)


def read(db: Db, keys: Iterable[str]) -> dict[str, Any]:
    """Each key's value, or None where nothing is set."""
    keys = tuple(keys)
    found: dict[str, Any] = {key: value for key, value in db.execute(
        select(Setting.key, Setting.value).where(Setting.key.in_(keys)))}
    return {key: found.get(key) for key in keys}


def write(db: Db, values: dict[str, Any], by: AppUser | None) -> None:
    """Set each key (None clears it), noting who. Not committed. Keys are
    defined in code, never taken from what a request sends."""
    who = by.id if by is not None else None
    for key, value in values.items():
        stmt = insert(Setting).values(key=key, value=value, created_by=who, updated_by=who)
        db.execute(stmt.on_conflict_do_update(
            index_elements=[Setting.key],
            set_={"value": stmt.excluded.value, "updated_by": who, "updated_at": func.now()}))
    db.flush()
```

`api/sdocs/api/schemas.py`:
```python
"""Checks more than one route shares, each with a message written for people."""
from __future__ import annotations

import re
import unicodedata
from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from sdocs.services import access

USERNAME = re.compile(r"[a-z0-9][a-z0-9._-]{1,63}")
USERNAME_RULE = ("Use 2 to 64 letters, numbers, dots, dashes or underscores, "
                 "starting with a letter or number.")


def normal_username(value: str) -> str:
    value = value.strip().lower()
    if not USERNAME.fullmatch(value):
        raise ValueError(USERNAME_RULE)
    return value


def new_password(value: str) -> str:
    if len(value) < access.MIN_PASSWORD:
        raise ValueError(f"Use at least {access.MIN_PASSWORD} characters.")
    return value


def no_control_chars(value: str) -> str:
    """Refuses control characters (NUL and the like), which PostgreSQL can't
    store and nobody types. Run it after spaces are tidied: tabs and newlines
    are control characters too."""
    if any(unicodedata.category(c) == "Cc" for c in value):
        raise ValueError("Use letters, numbers and punctuation only.")
    return value


def plain_name(value: str) -> str:
    """Spaces tidied; never blank; no control characters."""
    value = " ".join(value.split())
    if not value:
        raise ValueError("Can't be blank.")
    return no_control_chars(value)


Username = Annotated[str, Field(max_length=200), AfterValidator(normal_username)]
NewPassword = Annotated[str, Field(max_length=access.MAX_PASSWORD), AfterValidator(new_password)]
Name = Annotated[str, Field(max_length=120), AfterValidator(plain_name)]
Role = Literal["admin", "editor", "reviewer"]
```

`api/sdocs/api/routes/setup.py`:
```python
"""What the sign-in and first-run pages need before anyone signs in, and the
first run itself: the first admin and the organisation's name. Once anyone
exists, first run is refused for good; the way back in after that is
`sdocs set-password`."""
from __future__ import annotations

from fastapi import APIRouter, Response
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, text
from sqlalchemy.orm import Session as Db

from sdocs.api.deps import DB
from sdocs.api.errors import ApiError
from sdocs.api.routes.auth import MeOut, signed_in
from sdocs.api.schemas import Name, NewPassword, Username
from sdocs.models import AppUser
from sdocs.services import access, settings

router = APIRouter(tags=["setup"])


class BrandingOut(BaseModel):
    setup_needed: bool
    org_name: str | None
    # the logo in use (GET /v1/branding/logo); its id changes with each upload
    logo_id: str | None


def anyone(db: Db) -> bool:
    return db.execute(select(AppUser.id).limit(1)).first() is not None


@router.get("/branding", response_model=BrandingOut)
def branding(db: DB):
    """Whether first run is needed, and the organisation's name and logo.
    Needs no session: the sign-in page shows them."""
    org = settings.read(db, (settings.ORG_NAME, settings.ORG_LOGO))
    return BrandingOut(setup_needed=not anyone(db), org_name=org[settings.ORG_NAME],
                       logo_id=org[settings.ORG_LOGO])


class SetupIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    org_name: Name
    display_name: Name
    username: Username
    password: NewPassword


@router.post("/setup", status_code=201, response_model=MeOut)
def setup(body: SetupIn, db: DB, response: Response):
    # one first run at a time: another, sent at the same moment, waits here
    # until this one commits, then finds the admin it made
    db.execute(text("select pg_advisory_xact_lock(hashtext('sdocs.setup'))"))
    if anyone(db):
        raise ApiError(409, "already_set_up", "Simple Docs is already set up. Sign in instead.")
    admin = AppUser(username=body.username, display_name=body.display_name, role="admin",
                    password_hash=access.hash_password(body.password), active=True,
                    failed_attempts=0)
    db.add(admin)
    db.flush()
    settings.write(db, {settings.ORG_NAME: body.org_name}, admin)
    return signed_in(db, admin, response)
```

In `api/sdocs/api/app.py`, import `setup` beside `auth` and include it:
```python
from sdocs.api.routes import auth, setup
```
```python
v1.include_router(setup.router)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_setup.py -v`
Expected: `7 passed`.

**Step 5: Commit**

```
git add api/sdocs/services/settings.py api/sdocs/api/schemas.py api/sdocs/api/routes/setup.py \
  api/sdocs/api/app.py api/tests/test_setup.py
git commit -m "Set up a fresh install once: the first admin and the organisation's name" \
  -m "GET /v1/branding tells the sign-in page whether first run is needed. Two first runs at once make one admin." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 10: Users: an admin lists them and adds someone

**Files:**
- Create: `api/sdocs/api/routes/users.py`
- Modify: `api/sdocs/api/app.py` (include the router)
- Modify: `api/tests/conftest.py` (append `beaten_to_it`)
- Test: `api/tests/test_users.py`

**Step 1: Write the failing test**

Append to `api/tests/conftest.py` (Simple LMS's, as shipped):
```python


@pytest.fixture
def beaten_to_it(engine):
    """Another request, at the same moment, commits `row` after this one's
    check and before its insert: arm(row, "key") waits for an object like
    `row` with the same key to be flushed, and commits `row` first."""
    from sqlalchemy import event

    armed = []

    def before_flush(session, context, instances):
        for row, field in list(armed):
            if any(type(o) is type(row) and getattr(o, field) == getattr(row, field)
                   for o in [*session.new, *session.dirty] if o is not row):
                armed.remove((row, field))
                with Session(engine) as other:
                    other.add(row)
                    other.commit()

    event.listen(Session, "before_flush", before_flush)
    yield lambda row, field: armed.append((row, field))
    event.remove(Session, "before_flush", before_flush)
```

`api/tests/test_users.py`:
```python
from sqlalchemy import select

from conftest import fresh_client, make_user, sign_in
from sdocs.models import AppUser

KIM = {"username": "Kim", "display_name": "Kim Lee", "role": "reviewer",
       "password": "another long password"}
FORBIDDEN = {"error": {"code": "forbidden", "message": "Your role can't do that. Ask an admin."}}


def test_an_admin_sees_everyone_active_first_by_name(admin_client, db, admin, editor):
    make_user(db, "old", "Old Timer", "reviewer", active=False)
    make_user(db, "ada", "Ada Ng", "editor")
    items = admin_client.get("/v1/users").json()["items"]
    assert [u["username"] for u in items] == ["ada", "leighton", "mel", "old"]
    assert items[-1]["active"] is False
    assert set(items[0]) == {"id", "username", "display_name", "role", "active", "locked",
                             "last_sign_in_at", "created_at"}


def test_only_an_admin_sees_or_adds_users(editor_client, reviewer_client, client):
    for c in (editor_client, reviewer_client):
        r = c.get("/v1/users")
        assert r.status_code == 403 and r.json() == FORBIDDEN
        assert c.post("/v1/users", json=KIM).status_code == 403
    assert client.get("/v1/users").status_code == 401


def test_an_admin_adds_someone_who_can_then_sign_in(admin_client, db, admin):
    r = admin_client.post("/v1/users", json=KIM)
    assert r.status_code == 201
    out = r.json()
    assert (out["username"], out["display_name"], out["role"], out["active"], out["locked"]) == (
        "kim", "Kim Lee", "reviewer", True, False)
    assert "another long password" not in r.text
    kim = db.execute(select(AppUser).where(AppUser.username == "kim")).scalar_one()
    assert kim.created_by == admin.id and kim.password_hash.startswith("$argon2id$")
    assert sign_in(fresh_client(), "kim", "another long password")["role"] == "reviewer"


def test_a_username_is_taken_whatever_its_case(admin_client, editor):
    r = admin_client.post("/v1/users", json={**KIM, "username": "MEL"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"username": "That username is taken."}


def test_a_username_taken_at_the_same_moment_is_still_taken(admin_client, beaten_to_it):
    beaten_to_it(AppUser(username="kim", display_name="Kim Other", role="editor",
                         password_hash="x"), "username")
    r = admin_client.post("/v1/users", json=KIM)
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"username": "That username is taken."}


def test_a_new_user_needs_a_known_role_and_a_long_password(admin_client):
    r = admin_client.post("/v1/users", json={**KIM, "role": "owner", "password": "short"})
    assert r.status_code == 422
    fields = r.json()["error"]["fields"]
    assert set(fields) == {"role", "password"}
    assert fields["password"] == "Use at least 12 characters."
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_users.py -v`
Expected: FAIL, `/v1/users` answers 404 (`assert 404 == 403`, `KeyError: 'items'`).

**Step 3: Write the implementation**

`api/sdocs/api/routes/users.py`:
```python
"""People who sign in, looked after by an admin. Deactivated, never
deleted: there is no DELETE here, and the database refuses one (rule 1)."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select

from sdocs.api.deps import DB, Principal, require
from sdocs.api.errors import ApiError, commit_unique, invalid
from sdocs.api.schemas import Name, NewPassword, Role, Username
from sdocs.models import AppUser
from sdocs.services import access

router = APIRouter(prefix="/users", tags=["users"])

Reader = Annotated[Principal, require("users:read")]
Admin = Annotated[Principal, require("users:write")]


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str
    role: str
    active: bool
    # five wrong passwords: it clears itself after 15 minutes, or with a new password
    locked: bool
    last_sign_in_at: datetime | None
    created_at: datetime


class UsersOut(BaseModel):
    items: list[UserOut]


def user_out(user: AppUser) -> UserOut:
    locked = user.locked_until is not None and user.locked_until > datetime.now(UTC)
    return UserOut(id=user.id, username=user.username, display_name=user.display_name,
                   role=user.role, active=user.active, locked=locked,
                   last_sign_in_at=user.last_sign_in_at, created_at=user.created_at)


def username_taken() -> ApiError:
    return invalid("username", "That username is taken.")


@router.get("", response_model=UsersOut)
def list_users(db: DB, who: Reader):
    """Everyone, active first, then by name."""
    rows = db.execute(select(AppUser).order_by(AppUser.active.desc(),
                                               func.lower(AppUser.display_name))).scalars()
    return UsersOut(items=[user_out(u) for u in rows])


class UserIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: Username
    display_name: Name
    role: Role
    password: NewPassword


@router.post("", status_code=201, response_model=UserOut)
def add_user(body: UserIn, db: DB, who: Admin):
    if db.execute(select(AppUser.id).where(AppUser.username == body.username)).first():
        raise username_taken()
    user = AppUser(username=body.username, display_name=body.display_name, role=body.role,
                   password_hash=access.hash_password(body.password), active=True,
                   failed_attempts=0, created_by=who.user.id)
    db.add(user)
    commit_unique(db, {"uq_app_user_username": username_taken()})
    return user_out(user)
```

In `api/sdocs/api/app.py`:
```python
from sdocs.api.routes import auth, setup, users
```
```python
v1.include_router(users.router)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_users.py -v`
Expected: `6 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/routes/users.py api/sdocs/api/app.py api/tests/conftest.py \
  api/tests/test_users.py
git commit -m "Let an admin list the people who sign in and add someone" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Users: renamed, given a role, deactivated and brought back; the last admin stays

**Files:**
- Modify: `api/sdocs/api/routes/users.py` (add PATCH)
- Test: `api/tests/test_user_changes.py`

**Step 1: Write the failing test**

`api/tests/test_user_changes.py`:
```python
from sqlalchemy import func, select

from conftest import all_at_once, fresh_client, make_user, sign_in, signed_in_client
from sdocs.models import AppUser

LAST = {"error": {"code": "last_admin", "message":
                  "Simple Docs needs at least one active admin. Make someone else an admin first."}}


def _patch(c, user, **change):
    return c.patch(f"/v1/users/{user.id}", json=change)


def test_an_admin_renames_someone_and_changes_their_role(admin_client, editor):
    r = _patch(admin_client, editor, display_name="  Melissa   Grant ", role="reviewer")
    assert r.status_code == 200
    assert (r.json()["display_name"], r.json()["role"]) == ("Melissa Grant", "reviewer")


def test_a_new_role_counts_from_the_next_request(admin_client, editor, editor_client):
    _patch(admin_client, editor, role="admin")
    assert editor_client.get("/v1/auth/me").json()["scopes"] == ["*"]


def test_deactivating_someone_signs_them_out_and_keeps_their_row(admin_client, db, editor,
                                                                 editor_client):
    r = _patch(admin_client, editor, active=False)
    assert r.status_code == 200 and r.json()["active"] is False
    assert editor_client.get("/v1/auth/me").status_code == 401
    assert db.execute(select(AppUser.active).where(AppUser.id == editor.id)).scalar_one() is False


def test_someone_deactivated_can_be_brought_back(admin_client, editor):
    _patch(admin_client, editor, active=False)
    assert _patch(admin_client, editor, active=True).json()["active"] is True
    assert sign_in(fresh_client(), "mel")["username"] == "mel"


def test_nobody_deactivates_themselves(admin_client, admin):
    r = _patch(admin_client, admin, active=False)
    assert r.status_code == 409
    assert r.json() == {"error": {"code": "own_account",
                                  "message": "You can't deactivate yourself. Ask another admin."}}


def test_the_last_active_admin_stays_an_admin(admin_client, db, admin):
    make_user(db, "gone", "Gone Admin", "admin", active=False)  # doesn't count
    r = _patch(admin_client, admin, role="editor")
    assert r.status_code == 409 and r.json() == LAST


def test_with_another_admin_one_can_step_down(admin_client, db, admin):
    make_user(db, "ada", "Ada Ng", "admin")
    assert _patch(admin_client, admin, role="editor").json()["role"] == "editor"


def test_two_admins_demoting_each_other_at_once_leave_one(db, admin):
    ada = make_user(db, "ada", "Ada Ng", "admin")
    mine, hers = signed_in_client(admin), signed_in_client(ada)
    turns = iter([lambda: _patch(mine, ada, role="editor").status_code,
                  lambda: _patch(hers, admin, role="editor").status_code])
    codes = sorted(all_at_once(2, lambda: next(turns)()))
    # the loser is refused as the last admin, or, if the winner got in before
    # its session was checked, as no longer an admin
    assert codes[0] == 200 and codes[1] in (403, 409)
    admins = db.execute(select(func.count()).select_from(AppUser)
                        .where(AppUser.role == "admin", AppUser.active.is_(True))).scalar()
    assert admins == 1


def test_people_are_never_deleted(admin_client, db, editor):
    r = admin_client.delete(f"/v1/users/{editor.id}")
    assert r.status_code == 405 and r.json()["error"]["code"] == "method_not_allowed"
    assert db.execute(select(AppUser.id).where(AppUser.id == editor.id)).scalar_one() == editor.id


def test_an_unknown_or_malformed_id(admin_client):
    r = admin_client.patch("/v1/users/00000000-0000-0000-0000-000000000000", json={"role": "editor"})
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
    assert admin_client.patch("/v1/users/kim", json={"role": "editor"}).status_code == 422


def test_only_an_admin_changes_anyone(editor_client, reviewer):
    assert _patch(editor_client, reviewer, role="admin").status_code == 403
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_user_changes.py -v`
Expected: FAIL, PATCH answers `405` (`assert 405 == 200`); `test_people_are_never_deleted` and `test_only_an_admin_changes_anyone` may pass already.

**Step 3: Write the implementation**

In `api/sdocs/api/routes/users.py`, add `not_found` to the errors import, `sessions` to the services import:
```python
from sdocs.api.errors import ApiError, commit_unique, invalid, not_found
from sdocs.services import access, sessions
```
and append:
```python


class UserPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    display_name: Name | None = None
    role: Role | None = None
    active: bool | None = None


def no_such_user() -> ApiError:
    return not_found("There's no user with that id.")


@router.patch("/{user_id}", response_model=UserOut)
def change_user(user_id: uuid.UUID, body: UserPatch, db: DB, who: Admin):
    """Rename, change role, deactivate or bring back. Nobody deactivates
    themselves, and the last active admin stays one."""
    # every active admin's row is locked first, in one order, so two admins
    # demoting each other at once can't leave nobody in charge
    admins = db.execute(select(AppUser).where(AppUser.role == "admin", AppUser.active.is_(True))
                        .order_by(AppUser.id).with_for_update()
                        .execution_options(populate_existing=True)).scalars().all()
    user = db.execute(select(AppUser).where(AppUser.id == user_id).with_for_update()
                      .execution_options(populate_existing=True)).scalar_one_or_none()
    if user is None:
        raise no_such_user()
    if body.active is False and user.id == who.user.id:
        raise ApiError(409, "own_account", "You can't deactivate yourself. Ask another admin.")
    stops_being_admin = user.role == "admin" and user.active and (
        body.active is False or body.role not in (None, "admin"))
    if stops_being_admin and len(admins) <= 1:
        raise ApiError(409, "last_admin", "Simple Docs needs at least one active admin. "
                                          "Make someone else an admin first.")
    if body.display_name is not None:
        user.display_name = body.display_name
    if body.role is not None:
        user.role = body.role
    if body.active is not None and body.active != user.active:
        user.active = body.active
        if not body.active:
            sessions.end_all(db, user)
    db.commit()
    return user_out(user)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_user_changes.py tests/test_users.py -v`
Expected: `17 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/routes/users.py api/tests/test_user_changes.py
git commit -m "Rename, change the role of, deactivate and bring back a user" \
  -m "Nobody deactivates themselves, and the last active admin stays one, even when two admins demote each other at once." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Passwords: an admin sets one, and you change your own

**Files:**
- Modify: `api/sdocs/api/routes/users.py` (add `POST /users/{id}/password`)
- Modify: `api/sdocs/api/routes/auth.py` (add `POST /auth/password`)
- Test: `api/tests/test_passwords.py`

**Step 1: Write the failing test**

`api/tests/test_passwords.py`:
```python
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
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_passwords.py -v`
Expected: FAIL, `assert 404 == 204` (no such routes yet), and `assert 404 == 401` for the last one.

**Step 3: Write the implementation**

In `api/sdocs/api/routes/users.py`, add `Response` to the fastapi import (`from fastapi import APIRouter, Response`) and append:
```python


class PasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    password: NewPassword


@router.post("/{user_id}/password", status_code=204)
def set_password(user_id: uuid.UUID, body: PasswordIn, db: DB, who: Admin):
    """A new password from an admin: it clears a lock and signs them out
    everywhere (but this session, if it is your own)."""
    user = db.execute(select(AppUser).where(AppUser.id == user_id)
                      .with_for_update()).scalar_one_or_none()
    if user is None:
        raise no_such_user()
    user.password_hash = access.hash_password(body.password)
    user.failed_attempts = 0
    user.locked_until = None
    sessions.end_all(db, user, keep=who.session if user.id == who.user.id else None)
    db.commit()
    return Response(status_code=204)
```

In `api/sdocs/api/routes/auth.py`, change the errors import and add the schemas one:
```python
from sdocs.api.errors import ApiError, invalid
from sdocs.api.schemas import NewPassword
```
and append:
```python


class OwnPasswordIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(max_length=access.MAX_PASSWORD)
    new_password: NewPassword


@router.post("/password", status_code=204)
def change_own_password(body: OwnPasswordIn, db: DB, who: Who):
    """Your own password, with the current one. Your other sessions end; this
    one carries on."""
    if not access.verify_password(body.current_password, who.user.password_hash):
        raise invalid("current_password", "That isn't your current password.")
    who.user.password_hash = access.hash_password(body.new_password)
    sessions.end_all(db, who.user, keep=who.session)
    db.commit()
    return Response(status_code=204)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_passwords.py -v`
Expected: `7 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/routes/users.py api/sdocs/api/routes/auth.py api/tests/test_passwords.py
git commit -m "Let an admin set anyone's password, and anyone change their own" \
  -m "A new password ends the person's other sessions; an admin's also clears a lock." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Settings → Organisation: name, ABN, phone, email and address

**Files:**
- Create: `api/sdocs/api/routes/org.py`
- Modify: `api/sdocs/api/app.py` (include the router)
- Test: `api/tests/test_org.py`

**Step 1: Write the failing test**

`api/tests/test_org.py`:
```python
from sqlalchemy import select

from sdocs.models import Setting

ACME = {"name": "Acme Pty Ltd", "abn": "51824753556", "phone": "03 9000 0000",
        "email": "Office@Acme.com.au", "address": "1 Collins Street\n\nMelbourne  VIC 3000 "}
SAVED = {"name": "Acme Pty Ltd", "abn": "51 824 753 556", "phone": "03 9000 0000",
         "email": "office@acme.com.au", "address": "1 Collins Street\nMelbourne VIC 3000",
         "logo_id": None}


def test_an_admin_sets_the_details_and_everyone_signed_in_reads_them(admin_client,
                                                                     reviewer_client, db, admin):
    r = admin_client.put("/v1/settings/org", json=ACME)
    assert r.status_code == 200 and r.json() == SAVED
    assert reviewer_client.get("/v1/settings/org").json() == SAVED
    row = db.execute(select(Setting).where(Setting.key == "org.abn")).scalar_one()
    assert row.value == "51 824 753 556" and row.updated_by == admin.id


def test_details_left_blank_are_cleared(admin_client):
    admin_client.put("/v1/settings/org", json=ACME)
    r = admin_client.put("/v1/settings/org", json={"name": "Acme", "abn": " ", "phone": "",
                                                   "email": None})
    assert r.json() == {"name": "Acme", "abn": None, "phone": None, "email": None,
                        "address": None, "logo_id": None}


def test_an_abn_must_pass_the_ato_check(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "abn": "51 824 753 557"})
    assert r.status_code == 422
    assert r.json() == {"error": {"code": "invalid",
                                  "message": "That isn't a valid ABN. Check the 11 digits.",
                                  "fields": {"abn": "That isn't a valid ABN. Check the 11 digits."}}}
    r = admin_client.put("/v1/settings/org", json={**ACME, "abn": "5182475355"})
    assert r.json()["error"]["fields"] == {"abn": "An ABN is 11 digits, e.g. 51 824 753 556."}


def test_the_name_is_needed_and_the_email_checked(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "name": " ", "email": "not an email"})
    assert r.json()["error"]["fields"] == {"name": "Can't be blank.",
                                           "email": "That doesn't look like an email address."}


def test_control_characters_are_refused(admin_client):
    r = admin_client.put("/v1/settings/org", json={**ACME, "phone": "03\u00009000 0000",
                                                   "address": "1 Collins\u0007 Street"})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {
        "phone": "Use letters, numbers and punctuation only.",
        "address": "Use letters, numbers and punctuation only."}


def test_only_an_admin_changes_them(editor_client):
    assert editor_client.put("/v1/settings/org", json=ACME).status_code == 403


def test_reading_them_needs_a_session(client):
    assert client.get("/v1/settings/org").status_code == 401
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_org.py -v`
Expected: FAIL, `assert 404 == 200` and the like.

**Step 3: Write the implementation**

`api/sdocs/api/routes/org.py`:
```python
"""Settings → Organisation: the details documents carry ({{org.*}} in
templates, from step 2) and the logo. Everyone signed in reads them; an
admin changes them. Each is a `setting` row: org.name, org.abn, org.phone,
org.email, org.address and org.logo."""
from __future__ import annotations

import re
from typing import Annotated

from fastapi import APIRouter
from pydantic import BaseModel, ConfigDict, Field, field_validator

from sdocs.api.deps import DB, Principal, Who, require
from sdocs.api.schemas import Name, no_control_chars
from sdocs.services import settings

router = APIRouter(prefix="/settings/org", tags=["settings"])

Admin = Annotated[Principal, require("settings:write")]

FIELDS = ("name", "abn", "phone", "email", "address")
ABN_WEIGHTS = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
DIGITS = "0123456789"
EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")


class OrgOut(BaseModel):
    name: str | None
    abn: str | None
    phone: str | None
    email: str | None
    address: str | None
    logo_id: str | None


def org_out(db) -> OrgOut:
    values = settings.read(db, settings.ORG_KEYS)
    return OrgOut(**{f: values[f"org.{f}"] for f in FIELDS}, logo_id=values[settings.ORG_LOGO])


def normal_abn(value: str) -> str:
    """11 digits that pass the ATO's check, written 51 824 753 556."""
    digits = "".join(c for c in value if c in DIGITS)
    if len(digits) != 11 or any(c not in DIGITS + " " for c in value):
        raise ValueError("An ABN is 11 digits, e.g. 51 824 753 556.")
    weighted = [int(d) for d in digits]
    weighted[0] -= 1
    if sum(d * w for d, w in zip(weighted, ABN_WEIGHTS, strict=True)) % 89:
        raise ValueError("That isn't a valid ABN. Check the 11 digits.")
    return f"{digits[:2]} {digits[2:5]} {digits[5:8]} {digits[8:]}"


class OrgIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Name
    abn: str | None = Field(default=None, max_length=20)
    phone: str | None = Field(default=None, max_length=32)
    email: str | None = Field(default=None, max_length=254)
    address: str | None = Field(default=None, max_length=300)

    # runs before the checks below (pydantic runs a field's validators in order)
    @field_validator("abn", "phone", "email", "address")
    @classmethod
    def _tidy(cls, value: str | None) -> str | None:
        """Spaces tidied on each line, blank lines dropped, control characters
        refused; blank is None."""
        if value is None:
            return None
        lines = (" ".join(line.split()) for line in value.splitlines())
        return "\n".join(no_control_chars(line) for line in lines if line) or None

    @field_validator("abn")
    @classmethod
    def _abn(cls, value: str | None) -> str | None:
        return None if value is None else normal_abn(value)

    @field_validator("email")
    @classmethod
    def _email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        if not EMAIL.fullmatch(value):
            raise ValueError("That doesn't look like an email address.")
        return value.lower()


@router.get("", response_model=OrgOut)
def get_org(db: DB, who: Who):
    return org_out(db)


@router.put("", response_model=OrgOut)
def put_org(body: OrgIn, db: DB, who: Admin):
    settings.write(db, {f"org.{f}": getattr(body, f) for f in FIELDS}, who.user)
    db.commit()
    return org_out(db)
```

In `api/sdocs/api/app.py`:
```python
from sdocs.api.routes import auth, org, setup, users
```
```python
v1.include_router(org.router)
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_org.py -v`
Expected: `7 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/routes/org.py api/sdocs/api/app.py api/tests/test_org.py
git commit -m "Keep the organisation's name, ABN, phone, email and address in Settings" \
  -m "The ABN passes the ATO's check and is written 51 824 753 556; blank details are cleared." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: The organisation's logo: PNG or JPEG, kept in the database

**Files:**
- Modify: `api/sdocs/api/routes/org.py` (add `PUT` and `DELETE /settings/org/logo`)
- Modify: `api/sdocs/api/routes/setup.py` (add `GET /branding/logo`)
- Test: `api/tests/test_logo.py`

**Step 1: Write the failing test**

`api/tests/test_logo.py`:
```python
from sqlalchemy import func, select

from sdocs.models import OrgLogo

# Only the first bytes are checked, so a signature and padding will do here
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _upload(c, content: bytes, mime: str = "image/png"):
    return c.put("/v1/settings/org/logo", content=content, headers={"Content-Type": mime})


def test_an_admin_uploads_a_logo_anyone_can_fetch(admin_client, client):
    assert _upload(admin_client, PNG).status_code == 204
    logo_id = client.get("/v1/branding").json()["logo_id"]
    assert logo_id is not None
    assert admin_client.get("/v1/settings/org").json()["logo_id"] == logo_id
    r = client.get("/v1/branding/logo")
    assert r.status_code == 200 and r.content == PNG
    assert r.headers["content-type"] == "image/png"
    assert r.headers["x-content-type-options"] == "nosniff"


def test_a_new_logo_takes_over_and_the_old_row_stays(admin_client, client, db):
    _upload(admin_client, PNG)
    first = client.get("/v1/branding").json()["logo_id"]
    _upload(admin_client, JPEG, "image/jpeg")
    assert client.get("/v1/branding").json()["logo_id"] != first
    r = client.get("/v1/branding/logo")
    assert r.content == JPEG and r.headers["content-type"] == "image/jpeg"
    assert db.execute(select(func.count()).select_from(OrgLogo)).scalar() == 2


def test_svg_and_other_kinds_are_refused(admin_client):
    svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    r = _upload(admin_client, svg, "image/svg+xml")
    assert r.status_code == 415
    assert r.json() == {"error": {"code": "unsupported_type",
                                  "message": "Use a PNG or JPEG for the logo."}}


def test_a_file_that_isnt_what_it_says_is_refused(admin_client):
    r = _upload(admin_client, JPEG, "image/png")
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {"logo": "That file isn't the PNG or JPEG it says it is."}


def test_a_logo_over_512_kb_is_refused(admin_client):
    r = _upload(admin_client, PNG + b"\x00" * (512 * 1024))
    assert r.status_code == 413 and r.json()["error"]["code"] == "too_large"


def test_removing_the_logo_goes_back_to_the_mark(admin_client, client):
    _upload(admin_client, PNG)
    assert admin_client.delete("/v1/settings/org/logo").status_code == 204
    assert client.get("/v1/branding").json()["logo_id"] is None
    r = client.get("/v1/branding/logo")
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"


def test_only_an_admin_changes_the_logo(editor_client):
    assert _upload(editor_client, PNG).status_code == 403
    assert editor_client.delete("/v1/settings/org/logo").status_code == 403
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_logo.py -v`
Expected: FAIL, the upload answers `405` (`assert 405 == 204`) and `/v1/branding/logo` `404`.

**Step 3: Write the implementation**

In `api/sdocs/api/routes/org.py`, change the fastapi import and add two:
```python
from fastapi import APIRouter, Body, Header, Response
```
```python
from sdocs.api.errors import ApiError, invalid
from sdocs.models import OrgLogo
```
and append:
```python


MAX_LOGO = 512 * 1024
# what each kind's bytes start with: the header alone is only a claim
SIGNATURES = {"image/png": b"\x89PNG\r\n\x1a\n", "image/jpeg": b"\xff\xd8\xff"}


@router.put("/logo", status_code=204)
def put_logo(content: Annotated[bytes, Body(media_type="image/png")], db: DB, who: Admin,
             content_type: Annotated[str | None, Header()] = None):
    """The logo is the request's body, sent as image/png or image/jpeg. SVG
    is refused: it can carry script."""
    mime = (content_type or "").split(";")[0].strip().lower()
    if mime not in SIGNATURES:
        raise ApiError(415, "unsupported_type", "Use a PNG or JPEG for the logo.")
    if len(content) > MAX_LOGO:
        raise ApiError(413, "too_large", "The logo can be 512 KB at most.")
    if not content.startswith(SIGNATURES[mime]):
        raise invalid("logo", "That file isn't the PNG or JPEG it says it is.")
    logo = OrgLogo(mime=mime, content=content, created_by=who.user.id)
    db.add(logo)
    db.flush()
    settings.write(db, {settings.ORG_LOGO: str(logo.id)}, who.user)
    db.commit()
    return Response(status_code=204)


@router.delete("/logo", status_code=204)
def remove_logo(db: DB, who: Admin):
    """Back to the Simple Docs mark. The old logo's row stays."""
    settings.write(db, {settings.ORG_LOGO: None}, who.user)
    db.commit()
    return Response(status_code=204)
```

In `api/sdocs/api/routes/setup.py`, add `import uuid` after `from __future__ import annotations`, and change two imports:
```python
from sdocs.api.errors import ApiError, not_found
from sdocs.models import AppUser, OrgLogo
```
and append:
```python


@router.get("/branding/logo")
def logo(db: DB):
    """The organisation's logo. Needs no session: the sign-in page shows it."""
    logo_id = settings.read(db, (settings.ORG_LOGO,))[settings.ORG_LOGO]
    row = db.get(OrgLogo, uuid.UUID(logo_id)) if logo_id else None
    if row is None:
        raise not_found("There's no logo. Simple Docs shows its own mark instead.")
    return Response(row.content, media_type=row.mime, headers={
        # the address stays the same across uploads; the page asks each time
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
    })
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_logo.py tests/test_org.py tests/test_setup.py -v`
Expected: `18 passed`.

**Step 5: Commit**

```
git add api/sdocs/api/routes/org.py api/sdocs/api/routes/setup.py api/tests/test_logo.py
git commit -m "Keep the organisation's logo in the database, PNG or JPEG up to 512 KB" \
  -m "The bytes must match the type they claim; SVG is refused. The sign-in page fetches it without a session." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: `sdocs create-user` and `sdocs set-password`, the way back in

**Files:**
- Create: `api/sdocs/cli.py`
- Test: `api/tests/test_cli.py`

**Step 1: Write the failing test**

`api/tests/test_cli.py`:
```python
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from conftest import PASSWORD, fresh_client, sign_in
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
```

**Step 2: Run it to see it fail**

Run: `cd api && .venv/bin/pytest tests/test_cli.py -v`
Expected: ERROR collecting, `ModuleNotFoundError: No module named 'sdocs.cli'`.

**Step 3: Write the implementation**

`api/sdocs/cli.py`:
```python
"""The sdocs command, for what has to happen outside the app: `create-user`
for an install set up by script, and `set-password`, the way back in when
nobody can sign in as an admin. In Compose: docker compose exec api sdocs ..."""
from __future__ import annotations

import argparse
import getpass
import sys

from sqlalchemy import select

from sdocs.api.schemas import USERNAME_RULE, normal_username
from sdocs.db import get_sessionmaker
from sdocs.models import ROLES, AppUser
from sdocs.services import access, sessions


def _say(problem: str) -> None:
    print(f"sdocs: {problem}", file=sys.stderr)


def _username(text: str) -> str | None:
    try:
        return normal_username(text)
    except ValueError:
        _say(f"{text!r} won't do as a username. {USERNAME_RULE}")
        return None


def _password(given: str | None) -> str | None:
    """The password given, or asked for twice; None, with the reason said, if it won't do."""
    password = given
    if not password:
        password = getpass.getpass("Password: ")
        if getpass.getpass("Password again: ") != password:
            _say("the passwords don't match")
            return None
    if len(password) < access.MIN_PASSWORD:
        _say(f"the password needs at least {access.MIN_PASSWORD} characters")
        return None
    return password


def cmd_create_user(args) -> int:
    username = _username(args.username)
    name = " ".join(args.name.split())
    if not name:
        _say("--name can't be blank")
        return 1
    password = _password(args.password) if username else None
    if username is None or password is None:
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


def cmd_set_password(args) -> int:
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
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
```

**Step 4: Run it to see it pass**

Run: `cd api && .venv/bin/pytest tests/test_cli.py -v`
Expected: `4 passed`.

Then the whole API, with lint and types:
Run: `cd api && .venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/mypy`
Expected: `93 passed`, `All checks passed!` and `Success: no issues found in ... source files` (fix anything ruff or mypy reports before committing).

**Step 5: Commit**

```
git add api/sdocs/cli.py api/tests/test_cli.py
git commit -m "Add sdocs create-user and sdocs set-password" \
  -m "set-password is the way back in when nobody can sign in as an admin." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: The API's image, and the API in Compose with migrations on start

**Files:**
- Create: `api/Dockerfile`
- Modify: `docker-compose.yml` (add `api`)
- Modify: `.env.example` (replace with the full file)

**Step 1: Write the files**

`api/Dockerfile`:
```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY pyproject.toml ./
COPY sdocs ./sdocs
COPY alembic.ini ./
COPY alembic ./alembic

RUN pip install --no-cache-dir . && rm -rf /root/.cache

EXPOSE 8000
CMD ["uvicorn", "sdocs.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

`docker-compose.yml` (replace; Task 26 adds `caddy`):
```yaml
services:
  db:
    image: postgres:16
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-sdocs}
      POSTGRES_USER: ${POSTGRES_USER:-sdocs}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}
    volumes:
      - pgdata:/var/lib/postgresql/data
    # 5436 so it sits beside Simple WMS's (5433), Simple TMS's (5434) and
    # Simple LMS's (5435) on one machine
    ports:
      - "127.0.0.1:${POSTGRES_PORT:-5436}:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-sdocs} -d ${POSTGRES_DB:-sdocs}"]
      interval: 5s
      timeout: 3s
      retries: 20

  api:
    build: ./api
    restart: unless-stopped
    # migrations run on every start, before the API takes requests
    command: sh -c "alembic upgrade head && uvicorn sdocs.api.app:app --host 0.0.0.0 --port 8000"
    environment:
      DOCS_DATABASE_URL: postgresql+psycopg://${POSTGRES_USER:-sdocs}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB:-sdocs}
      DOCS_COOKIE_SECURE: ${DOCS_COOKIE_SECURE:-false}
      # Read from step 3 on; they stay on the server, never sent to the browser
      DOCS_OPENROUTER_API_KEY: ${DOCS_OPENROUTER_API_KEY:-}
      DOCS_GITHUB_TOKEN: ${DOCS_GITHUB_TOKEN:-}
      DOCS_MONKIRO_API_KEY: ${DOCS_MONKIRO_API_KEY:-}
      # Step 4 mounts ${DOCS_REPO_ROOT} read-only at /repos, here and in the
      # worker, and sets DOCS_REPO_ROOT=/repos.
    depends_on:
      db:
        condition: service_healthy
    expose:
      - "8000"
    # Caddy is the way in. Published on the host as well, on 127.0.0.1 only,
    # for the desktop's dev server, scripts and CI.
    ports:
      - "127.0.0.1:${DOCS_API_PORT:-8044}:8000"
    healthcheck:
      test: ["CMD-SHELL", "python -c \"import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/v1/health')\""]
      interval: 10s
      timeout: 5s
      retries: 10
      start_period: 20s

  # worker: arrives with step 3, when there is a job queue to drain
  # (generation, exports, repo analysis, monkiro sync, pull requests). Same
  # image and DOCS_ settings as api, command `python -m sdocs.worker`, and
  # DOCS_REPO_ROOT mounted read-only like api from step 4.

volumes:
  pgdata:
```

`.env.example` (replace):
```
# Copy to .env and fill in. Nothing here is committed.

# Postgres (used by the db and api containers)
POSTGRES_DB=sdocs
POSTGRES_USER=sdocs
POSTGRES_PASSWORD=change-me
# Host port the database is published on (127.0.0.1 only). 5436 sits beside
# Simple WMS's 5433, Simple TMS's 5434 and Simple LMS's 5435. The tests expect
# POSTGRES_PASSWORD=sdocs-dev on this port unless TEST_DATABASE_URL says otherwise.
POSTGRES_PORT=5436

# Host port the API is published on (127.0.0.1 only), for the desktop's dev
# server, scripts and health checks. 8044, beside Simple WMS's 8011, Simple
# TMS's 8022 and Simple LMS's 8033.
DOCS_API_PORT=8044

# Where Simple Docs opens: http://localhost:<DOCS_HTTP_PORT>, on this machine
# only. 8080 unless something else has it (Platen's web app and the Q7 site's
# dev server do on Q7's Mac, which uses 8380).
DOCS_HTTP_PORT=8080

# The session cookie's Secure flag. Leave false for http://localhost; set
# true only if Simple Docs is served over https.
DOCS_COOKIE_SECURE=false

# The only folder Simple Docs may read code from, e.g.
# /Users/you/Q7 Technology/Software. Mounted read-only from step 4; nothing
# reads it yet.
DOCS_REPO_ROOT=

# Secrets. They stay on this machine and are never sent to the browser.
# OpenRouter, for writing with AI (step 3): https://openrouter.ai/settings/keys
DOCS_OPENROUTER_API_KEY=
# GitHub (steps 4 and 8): a fine-grained token that can read the repos you
# document, with pull requests: write on the ones you open PRs on.
DOCS_GITHUB_TOKEN=
# monkiro, optional (step 8)
DOCS_MONKIRO_API_KEY=
```

**Step 2: Bring your `.env` up to date and start the API**

```
cp .env.example .env
sed -i '' 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=sdocs-dev/; s/^DOCS_HTTP_PORT=.*/DOCS_HTTP_PORT=8380/' .env
docker compose up -d --build db api
```

**Step 3: Check it**

Run: `curl -fsS http://127.0.0.1:8044/v1/health`
Expected: `{"status":"ok"}`

Run: `curl -fsS http://127.0.0.1:8044/v1/branding`
Expected: `{"setup_needed":true,"org_name":null,"logo_id":null}`

Run: `docker compose exec -T db psql -U sdocs -d sdocs -tAc "select count(*) from pg_proc where proname = 'block_change'"`
Expected: `1`

Run: `docker compose exec -T api sdocs --help`
Expected: usage naming `create-user` and `set-password`.

**Step 4: Commit**

```
git add api/Dockerfile docker-compose.yml .env.example
git commit -m "Run the API in Compose, its migrations first, on 127.0.0.1:8044" \
  -m "The worker's place is marked for step 3; DOCS_REPO_ROOT is mounted from step 4." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 17: The desktop's skeleton, with the Q7 tokens as its Tailwind theme

**Files:**
- Create: `apps/desktop/package.json`, `apps/desktop/vite.config.ts`, `apps/desktop/tsconfig.json`, `apps/desktop/index.html`, `apps/desktop/eslint.config.js`, `apps/desktop/tailwind.config.ts`
- Create: `apps/desktop/src/design/tokens.json` (copied), `apps/desktop/src/design/theme.ts`
- Create: `apps/desktop/src/index.css`, `apps/desktop/src/main.tsx`, `apps/desktop/src/App.tsx`, `apps/desktop/src/vite-env.d.ts`
- Test: `apps/desktop/src/test/setup.ts`, `apps/desktop/src/test/theme.test.ts`

**Step 1: Write the project files and install**

`apps/desktop/package.json`:
```json
{
  "name": "simple-docs-desktop",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "license": "MIT",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "typecheck": "tsc -b",
    "lint": "eslint ."
  },
  "dependencies": {
    "lucide-react": "^0.511.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.0"
  },
  "devDependencies": {
    "@eslint/js": "^9.27.0",
    "@tailwindcss/vite": "^4.1.0",
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "eslint": "^9.27.0",
    "eslint-plugin-react-hooks": "^5.2.0",
    "globals": "^16.1.0",
    "jsdom": "^26.1.0",
    "tailwindcss": "^4.1.0",
    "typescript": "^5.8.0",
    "typescript-eslint": "^8.32.0",
    "vite": "^6.3.0",
    "vitest": "^3.2.0"
  }
}
```

`apps/desktop/vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Vite runs this under Node; the app itself never sees process.
declare const process: { env: Record<string, string | undefined> };

// 5178, beside Simple WMS's 5173, Simple TMS's 5174 and 5175 and Simple
// LMS's 5176 and 5177. /api is the API, as Caddy serves it: /api/v1/...
// reaches the API (127.0.0.1:8044 in Compose) as /v1/...
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5178,
    strictPort: true,
    proxy: {
      "/api": {
        target: process.env.DOCS_API_URL ?? "http://127.0.0.1:8044",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
  build: { outDir: "dist", sourcemap: false },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    testTimeout: 20000,
  },
});
```

`apps/desktop/tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "tailwind.config.ts"]
}
```

`apps/desktop/index.html`:
```html
<!doctype html>
<html lang="en-AU">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="dark" />
    <title>Simple Docs</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`apps/desktop/eslint.config.js`:
```js
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { "react-hooks": reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
```

`apps/desktop/src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

Copy the design system's tokens, then install:
```
mkdir -p apps/desktop/src/design apps/desktop/src/test apps/desktop/public
cp "/Users/leightonlauton/Q7 Technology/Software/q7/design-system/tokens.json" apps/desktop/src/design/tokens.json
cd apps/desktop && npm install
```

**Step 2: Write the failing test**

`apps/desktop/src/test/setup.ts`:
```ts
import "@testing-library/jest-dom/vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});
```

`apps/desktop/src/test/theme.test.ts`:
```ts
import tokens from "../design/tokens.json";
import { themeFromTokens, type Tokens } from "../design/theme";

const theme = themeFromTokens(tokens as Tokens);

describe("the Q7 tokens as a Tailwind theme", () => {
  it("puts the brand colours under space-, by their token names", () => {
    expect(theme.colors.space).toMatchObject({
      darkBlue: "#0d1117", lightGray: "#ccd6f6", gray: "#8892b0", blue: "#29abe2", gold: "#f7941d",
      lightGreen: "#4ade80",
    });
  });

  it("keeps the shadcn colours by name", () => {
    expect(theme.colors.ring).toBe("hsl(212.7, 26.8%, 83.9%)");
    expect(theme.colors.input).toBe("hsl(220, 13%, 15%)");
    expect(theme.colors.destructive).toBe("hsl(0, 62.8%, 30.6%)");
  });

  it("gives each text role its size, line height and weight", () => {
    expect(theme.fontSize["section-title-sm"]).toEqual(["30px", { lineHeight: "36px", fontWeight: "700" }]);
    expect(theme.fontSize.label).toEqual(["14px", { lineHeight: "20px", fontWeight: "500" }]);
    expect(theme.fontSize.eyebrow).toEqual(["12px", { lineHeight: "16px", fontWeight: "600", letterSpacing: "0.05em" }]);
  });

  it("names radii, shadows and widths as the tokens do", () => {
    expect(theme.borderRadius).toMatchObject({ md: "6px", lg: "8px", xl: "12px", full: "9999px" });
    expect(theme.boxShadow["glow-blue"]).toBe("0 0 24px rgba(41, 171, 226, 0.3)");
    expect(theme.maxWidth).toMatchObject({ shell: "1280px", panel: "896px", prose: "768px" });
    expect(theme.spacing.navbar).toBe("80px");
  });

  it("sets the system sans, as the site does", () => {
    expect(theme.fontFamily.sans).toMatch(/^ui-sans-serif, system-ui/);
  });
});
```

**Step 3: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/theme.test.ts`
Expected: FAIL, `Failed to resolve import "../design/theme" from "src/test/theme.test.ts"`.

**Step 4: Write the theme, the CSS and a first page**

`apps/desktop/src/design/theme.ts`:
```ts
/** The Q7 design system's tokens (tokens.json beside this file, a copy of
 * Q7's design-system/tokens.json) as a Tailwind theme. To take a newer
 * version, copy the file again; nothing else changes.
 *
 * Colours keep their token names (bg-space-darkBlue, ring, input), type
 * styles become sizes by role (text-section-title-sm, text-label), radii
 * and shadows keep theirs (rounded-lg, shadow-glow-blue), and layout widths
 * lose their suffix (max-w-shell, max-w-prose; h-navbar). */

interface Named {
  name: string;
  value: string;
}

interface TypeStyle {
  name: string;
  fontSize: string;
  lineHeight: number | string;
  fontWeight: number;
  letterSpacing?: string;
}

export interface Tokens {
  color: { tokens: Named[] };
  type: { families: { sans: string; mono: string }; groups: { styles: TypeStyle[] }[] };
  radius: { tokens: Named[] };
  shadow: { tokens: Named[] };
  layout: { tokens: Named[] };
}

type FontSize = [string, { lineHeight: string; fontWeight: string; letterSpacing?: string }];

function byName(list: Named[], rename: (name: string) => string): Record<string, string> {
  return Object.fromEntries(list.map(({ name, value }) => [rename(name), value]));
}

export function themeFromTokens(t: Tokens) {
  const space: Record<string, string> = {};
  const colors: Record<string, string | Record<string, string>> = { space };
  for (const { name, value } of t.color.tokens) {
    if (name.startsWith("space-")) space[name.slice("space-".length)] = value;
    else colors[name] = value;
  }

  const fontSize: Record<string, FontSize> = {};
  for (const group of t.type.groups) {
    for (const s of group.styles) {
      fontSize[s.name] = [s.fontSize, {
        lineHeight: String(s.lineHeight),
        fontWeight: String(s.fontWeight),
        ...(s.letterSpacing ? { letterSpacing: s.letterSpacing } : {}),
      }];
    }
  }

  const layout = byName(t.layout.tokens, (n) => n.replace(/-(max|height)$/, ""));
  return {
    colors,
    fontFamily: { sans: t.type.families.sans, mono: t.type.families.mono },
    fontSize,
    borderRadius: byName(t.radius.tokens, (n) => n.replace(/^radius-/, "")),
    // shadow-sm and shadow-lg keep their step; glow-blue stays glow-blue
    boxShadow: byName(t.shadow.tokens, (n) => n.replace(/^shadow-/, "")),
    maxWidth: layout,
    spacing: { navbar: layout.navbar },
  };
}
```

`apps/desktop/tailwind.config.ts`:
```ts
import type { Config } from "tailwindcss";
import tokens from "./src/design/tokens.json";
import { themeFromTokens, type Tokens } from "./src/design/theme";

// One dark theme: there is no light palette, so no darkMode and no dark: variants.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: themeFromTokens(tokens as Tokens) },
} satisfies Config;
```

`apps/desktop/src/index.css`:
```css
@import "tailwindcss";
@config "../tailwind.config.ts";

@layer base {
  html,
  body,
  #root {
    min-height: 100%;
  }
  body {
    @apply bg-space-darkBlue font-sans text-body text-space-lightGray antialiased;
  }
  /* The focus ring: 2px ring with a 2px offset. Never removed. */
  :focus-visible {
    @apply outline-2 outline-offset-2 outline-ring;
  }
  /* lucide icons at 1.5px, everywhere (design system: Iconography) */
  svg.lucide {
    stroke-width: 1.5;
  }
}

/* Anyone who asks for less motion gets every animation and transition at its
   last frame (design: Look). */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

`apps/desktop/src/App.tsx` (Task 21 replaces it):
```tsx
export function App() {
  return <main className="p-8 text-section-title-sm text-space-lightGray">Simple Docs</main>;
}
```

`apps/desktop/src/main.tsx`:
```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

**Step 5: Run it to see it pass, and build**

Run: `cd apps/desktop && npm test`
Expected: `5 passed`.

Run: `cd apps/desktop && npm run build && grep -c "0d1117" dist/assets/*.css`
Expected: the build succeeds and the count is at least `1` (the token colour reached the CSS).

Run: `cd apps/desktop && npm run lint`
Expected: no problems.

**Step 6: Commit**

```
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/vite.config.ts \
  apps/desktop/tsconfig.json apps/desktop/index.html apps/desktop/eslint.config.js \
  apps/desktop/tailwind.config.ts apps/desktop/src/design apps/desktop/src/index.css \
  apps/desktop/src/main.tsx apps/desktop/src/App.tsx apps/desktop/src/vite-env.d.ts \
  apps/desktop/src/test/setup.ts apps/desktop/src/test/theme.test.ts
git commit -m "Start the desktop with the Q7 design system's tokens as its Tailwind theme" \
  -m "One dark theme, the system sans, a 2px focus ring, 1.5px icons, and motion that stops for anyone who asks." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 18: The Q7 components: Button, Card, Input and fields, Badge, Chip, SectionHeading, Notice

**Files:**
- Create: `apps/desktop/src/ui/cn.ts`, `apps/desktop/src/ui/Button.tsx`, `apps/desktop/src/ui/Card.tsx`, `apps/desktop/src/ui/Field.tsx`, `apps/desktop/src/ui/Badge.tsx`, `apps/desktop/src/ui/Chip.tsx`, `apps/desktop/src/ui/SectionHeading.tsx`, `apps/desktop/src/ui/Notice.tsx`
- Test: `apps/desktop/src/test/ui.test.tsx`

**Step 1: Write the failing test**

`apps/desktop/src/test/ui.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardTitle } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { SectionHeading } from "../ui/SectionHeading";

describe("the Q7 components", () => {
  it("fills a primary button space-blue with space-darkBlue text, never white", () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button).toHaveClass("bg-space-blue", "text-space-darkBlue");
    expect(button.className).not.toMatch(/text-white/);
    expect(button).toHaveAttribute("type", "button");
  });

  it("keeps the focus ring on every button", () => {
    render(<Button variant="ghost">Cancel</Button>);
    expect(screen.getByRole("button")).toHaveClass("focus-visible:outline-ring");
  });

  it("draws a card on the brand surface", () => {
    render(<Card data-testid="card"><CardTitle>Users</CardTitle></Card>);
    expect(screen.getByTestId("card")).toHaveClass("bg-space-darkBlue/60", "border-space-blue/20", "backdrop-blur-sm");
    expect(screen.getByRole("heading", { level: 2, name: "Users" })).toHaveClass("text-space-lightGray");
  });

  it("wires a field's label, hint and error to its input", () => {
    render(<TextField label="Username" hint="Lower case is fine." error="That username is taken." />);
    const input = screen.getByLabelText("Username");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Lower case is fine. That username is taken.");
  });

  it("leaves a field without an error unmarked", () => {
    render(<TextField label="Phone" />);
    expect(screen.getByLabelText("Phone")).not.toHaveAttribute("aria-invalid");
  });

  it("hides a chip's icon from screen readers and keeps its words", () => {
    const { container } = render(<Chip icon={Sparkles} tone="eyebrow" accent="gold">Draft</Chip>);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Draft")).toHaveClass("uppercase", "text-space-gold");
  });

  it("starts a heading with its accent phrase", () => {
    render(<SectionHeading accentText="Set up" description="Two minutes.">Simple Docs</SectionHeading>);
    const heading = screen.getByRole("heading", { level: 1, name: "Set up Simple Docs" });
    expect(heading.querySelector("span")).toHaveClass("text-space-blue");
    expect(screen.getByText("Two minutes.")).toHaveClass("text-space-gray");
  });

  it("says a warning as an alert and a success as a status", () => {
    render(<><Notice>Wrong username or password.</Notice><Notice tone="success">Saved.</Notice></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Wrong username or password.");
    expect(screen.getByRole("status")).toHaveTextContent("Saved.");
  });

  it("gives a badge its word in its own casing", () => {
    render(<Badge tone="gold">Locked</Badge>);
    expect(screen.getByText("Locked")).toHaveClass("text-space-gold");
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/ui.test.tsx`
Expected: FAIL, `Failed to resolve import "../ui/Badge"`.

**Step 3: Write the components**

`apps/desktop/src/ui/cn.ts`:
```ts
/** Class names joined, the empty ones left out. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
```

`apps/desktop/src/ui/Button.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "default" | "sm" | "lg" | "icon";

// The design system's Button: 40px, radius-md, the label style, an icon
// child at 16px and click-through, and the focus ring kept.
const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-label transition-colors " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:pointer-events-none disabled:opacity-50 " +
  "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0";

const variants: Record<ButtonVariant, string> = {
  // space-darkBlue on space-blue: the AA-safe pairing (white would be 2.6:1)
  primary: "bg-space-blue text-space-darkBlue hover:bg-space-blue/90",
  // the second action: a blue hairline, because gold means a warning here
  outline: "border border-space-blue/30 text-space-lightGray hover:border-space-blue/50 hover:bg-space-blue/10",
  ghost: "text-space-lightGray hover:bg-space-blue/10",
  // dark enough that light text reads (7.0:1)
  destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
};

const sizes: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
  lg: "h-11 px-8",
  icon: "h-10 w-10",
};

export interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/** type="button" unless told otherwise, so one inside a form doesn't submit
 * it by accident. An icon-only button needs an aria-label. */
export function Button({ variant = "primary", size = "default", type = "button", className, ...props }: ButtonProps) {
  return <button type={type} className={cn(base, variants[variant], sizes[size], className)} {...props} />;
}
```

`apps/desktop/src/ui/Card.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "./cn";

/** The brand surface, not the bare one: space-blue at 20% for the edge and
 * space-darkBlue at 60% with a blur, so the stars read through. */
export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-space-blue/20 bg-space-darkBlue/60 shadow-sm backdrop-blur-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 p-6", className)} {...props} />;
}

/** card-title in space-lightGray: an h2 unless `level` says otherwise. */
export function CardTitle({ level = 2, className, ...props }: ComponentProps<"h2"> & { level?: 1 | 2 | 3 }) {
  const Tag = `h${level}` as "h1" | "h2" | "h3";
  return <Tag className={cn("text-card-title text-space-lightGray", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p className={cn("text-body-sm text-space-gray", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

export function CardFooter({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex items-center gap-3 p-6 pt-0", className)} {...props} />;
}
```

`apps/desktop/src/ui/Field.tsx`:
```tsx
import { useId, type ComponentProps, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "./cn";

// The design system's Input and Textarea: radius-md, the input border on the
// background fill, the focus ring. A field that is wrong takes a gold edge.
const control =
  "w-full rounded-md border border-input bg-background px-3 text-space-lightGray " +
  "placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
  "disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-space-gold";

/** 40px tall; 16px text on a phone (iOS zooms the page under 16) and 14px from md. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, "h-10 py-2 text-base md:text-sm", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-[80px] py-2 text-body-sm", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, "h-10 text-base md:text-sm", className)} {...props} />;
}

interface Control {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
}

interface Labelled {
  label: string;
  error?: string;
  hint?: string;
  className?: string;
}

/** A label, the control, a hint and what is wrong, wired together. The
 * error is gold with an icon and words: colour is never the only sign. */
export function Field({ label, error, hint, className, children }: Labelled & { children: (control: Control) => ReactNode }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : "", error ? errorId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-label text-space-lightGray">{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && <p id={hintId} className="text-caption text-space-gray">{hint}</p>}
      {error && (
        <p id={errorId} className="flex items-center gap-1.5 text-body-sm text-space-gold">
          <TriangleAlert aria-hidden="true" className="h-4 w-4 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, error, hint, className, ...props }: Labelled & ComponentProps<"input">) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(c) => <Input {...c} {...props} />}
    </Field>
  );
}

export function TextAreaField({ label, error, hint, className, ...props }: Labelled & ComponentProps<"textarea">) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(c) => <Textarea {...c} {...props} />}
    </Field>
  );
}

export function SelectField({ label, error, hint, className, children, ...props }: Labelled & ComponentProps<"select">) {
  return (
    <Field label={label} error={error} hint={hint} className={className}>
      {(c) => <Select {...c} {...props}>{children}</Select>}
    </Field>
  );
}
```

`apps/desktop/src/ui/Badge.tsx`:
```tsx
import type { ComponentProps } from "react";
import { cn } from "./cn";

export type BadgeTone = "blue" | "gold" | "gray" | "green";

const tones: Record<BadgeTone, string> = {
  blue: "border-space-blue/30 text-space-blue",
  gold: "border-space-gold/30 text-space-gold",
  gray: "border-space-gray/30 text-space-gray",
  green: "border-space-lightGreen/30 text-space-lightGreen",
};

/** The design system's outline Badge, re-tinted. Its word keeps its own
 * casing and says the state: the colour is never the only sign. */
export function Badge({ tone = "blue", className, ...props }: ComponentProps<"span"> & { tone?: BadgeTone }) {
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-badge", tones[tone], className)} {...props} />
  );
}
```

`apps/desktop/src/ui/Chip.tsx`:
```tsx
import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type Accent = "blue" | "gold" | "mint" | "violet";

const text: Record<Accent, string> = {
  blue: "text-space-blue",
  gold: "text-space-gold",
  mint: "text-space-lightBlue",
  violet: "text-space-purple",
};

const tint: Record<Accent, string> = {
  blue: "border-space-blue/30 bg-space-blue/10",
  gold: "border-space-gold/30 bg-space-gold/10",
  mint: "border-space-lightBlue/30 bg-space-lightBlue/10",
  violet: "border-space-purple/30 bg-space-purple/10",
};

export interface ChipProps extends ComponentProps<"span"> {
  /** A lucide-react icon: the component, not an element. Decorative. */
  icon?: LucideIcon;
  accent?: Accent;
  /** eyebrow: uppercase, over a heading · feature: a capability · meta: a quiet counter */
  tone?: "eyebrow" | "feature" | "meta";
}

/** The design system's Chip. Never interactive; its words stand alone. */
export function Chip({ icon: Icon, accent = "blue", tone = "feature", className, children, ...props }: ChipProps) {
  const look =
    tone === "eyebrow"
      ? cn("border px-3 py-1 text-eyebrow uppercase", tint[accent], text[accent])
      : tone === "meta"
        ? "border border-space-blue/20 px-3 py-1 text-caption text-space-gray"
        : "border border-space-blue/20 bg-space-darkBlue/60 px-3 py-1.5 text-body-sm text-space-lightGray backdrop-blur-sm";
  return (
    <span className={cn("inline-flex items-center gap-2 rounded-full", look, className)} {...props}>
      {Icon && tone !== "meta" && <Icon aria-hidden="true" className={cn("h-4 w-4", text[accent])} />}
      {children}
    </span>
  );
}
```

`apps/desktop/src/ui/SectionHeading.tsx`:
```tsx
import type { ReactNode } from "react";
import { cn } from "./cn";

interface SectionHeadingProps {
  /** The leading phrase, in the accent colour. */
  accentText: string;
  /** The rest of the heading, in space-lightGray. */
  children?: ReactNode;
  /** The lead under it: two sentences at most. */
  description?: ReactNode;
  /** Gold only for talking to someone; blue for everything else. */
  accent?: "blue" | "gold";
  /** An app page's title is its h1; the design system's default is a site section's h2. */
  level?: 1 | 2;
  className?: string;
}

/** The design system's heading pattern, left-aligned for an app page. */
export function SectionHeading({ accentText, children, description, accent = "blue", level = 1, className }: SectionHeadingProps) {
  const Tag = `h${level}` as "h1" | "h2";
  return (
    <div className={cn("flex max-w-prose flex-col gap-3", className)}>
      <Tag className="text-section-title-sm text-space-lightGray">
        <span className={accent === "gold" ? "text-space-gold" : "text-space-blue"}>{accentText}</span>
        {children ? <> {children}</> : null}
      </Tag>
      {description && <p className="text-lead text-space-gray">{description}</p>}
    </div>
  );
}
```

`apps/desktop/src/ui/Notice.tsx`:
```tsx
import type { ReactNode } from "react";
import { CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

type Tone = "warning" | "success" | "info";

const looks: Record<Tone, string> = {
  warning: "border-space-gold/30 bg-space-gold/[0.07] [&>svg]:text-space-gold",
  success: "border-space-lightGreen/30 bg-space-lightGreen/[0.07] [&>svg]:text-space-lightGreen",
  info: "border-space-blue/30 bg-space-blue/[0.07] [&>svg]:text-space-blue",
};

const icons = { warning: TriangleAlert, success: CircleCheck, info: Info };

/** A message in the SimulatedNotice's frame. A warning is an alert, read out
 * at once; a success or a note is a status. Icon and words, never colour alone. */
export function Notice({ tone = "warning", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  const Icon = icons[tone];
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cn("flex items-start gap-3 rounded-xl border p-4 text-body-sm text-space-lightGray", looks[tone], className)}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
```

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test`
Expected: `14 passed` (5 theme, 9 components).

**Step 5: Commit**

```
git add apps/desktop/src/ui apps/desktop/src/test/ui.test.tsx
git commit -m "Recreate the Q7 components the desktop needs from the design system's READMEs" \
  -m "Primary buttons are space-blue with space-darkBlue text, the AA-safe pairing; fields wire their label, hint and error." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 19: The star field, the Simple Docs mark and the organisation's logo

**Files:**
- Create: `apps/desktop/src/ui/StarField.tsx`, `apps/desktop/src/ui/SimpleDocsMark.tsx`, `apps/desktop/src/ui/OrgMark.tsx`
- Create: `apps/desktop/public/favicon.svg`
- Test: `apps/desktop/src/test/marks.test.tsx`

**Step 1: Write the failing test**

`apps/desktop/src/test/marks.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { OrgMark } from "../ui/OrgMark";
import { SimpleDocsMark } from "../ui/SimpleDocsMark";
import { makeStars, StarField } from "../ui/StarField";

describe("the marks and the star field", () => {
  it("draws the same still star field every time, hidden from screen readers", () => {
    expect(makeStars(140, 7)).toEqual(makeStars(140, 7));
    for (const star of makeStars(140, 7)) {
      expect(star.x).toBeGreaterThanOrEqual(0);
      expect(star.x).toBeLessThanOrEqual(100);
      expect(star.y).toBeGreaterThanOrEqual(0);
      expect(star.y).toBeLessThanOrEqual(100);
    }
    render(<StarField />);
    const field = screen.getByTestId("star-field");
    expect(field).toHaveAttribute("aria-hidden", "true");
    expect(field).toHaveClass("pointer-events-none", "fixed");
    expect(field.querySelectorAll("circle")).toHaveLength(140);
    expect(field.querySelector("animate")).toBeNull();
  });

  it("keeps the Simple Docs mark decorative unless it is named", () => {
    const { container, rerender } = render(<SimpleDocsMark />);
    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    rerender(<SimpleDocsMark title="Simple Docs" />);
    expect(screen.getByRole("img", { name: "Simple Docs" })).toBeInTheDocument();
  });

  it("shows the organisation's logo when there is one, else the mark", () => {
    const { container, rerender } = render(<OrgMark logoId="logo-1" />);
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/branding/logo?v=logo-1");
    expect(container.querySelector("img")).toHaveAttribute("alt", "");
    rerender(<OrgMark logoId={null} />);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/marks.test.tsx`
Expected: FAIL, `Failed to resolve import "../ui/OrgMark"`.

**Step 3: Write the implementation**

`apps/desktop/src/ui/StarField.tsx`:
```tsx
export interface Star {
  x: number;
  y: number;
  r: number;
  o: number;
}

/** Points from a seeded sequence (Park–Miller), so the field is the same on
 * every load and in every test. x and y are percent of the window. */
export function makeStars(count: number, seed: number): Star[] {
  let s = seed;
  const next = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const round = (n: number) => Math.round(n * 100) / 100;
  return Array.from({ length: count }, () => ({
    x: round(next() * 100),
    y: round(next() * 100),
    r: round(next() * 0.9 + 0.3),
    o: round(next() * 0.55 + 0.25),
  }));
}

const STARS = makeStars(140, 7);

/** The star field behind every screen (the design system's ground). Fixed,
 * decoration only, and still: nothing on it moves. */
export function StarField() {
  return (
    <svg
      data-testid="star-field"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
      aria-hidden="true"
      focusable="false"
    >
      {STARS.map((s, i) => (
        <circle key={i} cx={`${s.x}%`} cy={`${s.y}%`} r={s.r} fill="#ffffff" opacity={s.o} />
      ))}
    </svg>
  );
}
```

`apps/desktop/src/ui/SimpleDocsMark.tsx`:
```tsx
/** Simple Docs' own mark, for an organisation with no logo: a page with its
 * corner folded, three lines of writing, and a sparkle for the draft
 * written for you. space-lightGray, space-gray and space-blue. Decorative
 * unless given a title. */
export function SimpleDocsMark({ size = 32, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="#ccd6f6" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M19 3v7h7" stroke="#ccd6f6" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 17h7M10 21h9M10 25h12" stroke="#8892b0" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M23 12.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#29abe2" />
    </svg>
  );
}
```

`apps/desktop/src/ui/OrgMark.tsx`:
```tsx
import { SimpleDocsMark } from "./SimpleDocsMark";

/** The organisation's logo from Settings, or Simple Docs' mark when there is
 * none. The name beside it says whose it is, so the picture is decorative.
 * The logo's id is in the address, so a new upload is fetched afresh. */
export function OrgMark({ logoId, size = 32 }: { logoId: string | null; size?: number }) {
  if (logoId) {
    return (
      <img
        src={`/api/v1/branding/logo?v=${encodeURIComponent(logoId)}`}
        alt=""
        width={size}
        height={size}
        className="rounded-sm object-contain"
      />
    );
  }
  return <SimpleDocsMark size={size} />;
}
```

`apps/desktop/public/favicon.svg`:
```svg
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none">
  <rect width="32" height="32" rx="6" fill="#0d1117"/>
  <path d="M8 3h11l7 7v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="#ccd6f6" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M19 3v7h7" stroke="#ccd6f6" stroke-width="1.5" stroke-linejoin="round"/>
  <path d="M10 17h7M10 21h9M10 25h12" stroke="#8892b0" stroke-width="1.5" stroke-linecap="round"/>
  <path d="M23 12.5l1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1z" fill="#29abe2"/>
</svg>
```

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test`
Expected: `17 passed`.

**Step 5: Commit**

```
git add apps/desktop/src/ui/StarField.tsx apps/desktop/src/ui/SimpleDocsMark.tsx \
  apps/desktop/src/ui/OrgMark.tsx apps/desktop/public/favicon.svg apps/desktop/src/test/marks.test.tsx
git commit -m "Draw a still star field, a Simple Docs mark, and the organisation's logo when it has one" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 20: The desktop's API client: the cookie, the header and the error shape

**Files:**
- Create: `apps/desktop/src/api/client.ts`, `apps/desktop/src/api/types.ts`
- Test: `apps/desktop/src/test/client.test.ts`

**Step 1: Write the failing test**

`apps/desktop/src/test/client.test.ts`:
```ts
import { ApiClient, ApiError, messageOf, Unreachable } from "../api/client";

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("ApiClient", () => {
  let calls: { url: string; init: RequestInit }[];
  let answers: (Response | Error)[];
  let client: ApiClient;

  beforeEach(() => {
    calls = [];
    answers = [];
    client = new ApiClient(async (url, init) => {
      calls.push({ url, init });
      const a = answers.shift() ?? json(500, { error: { code: "no_answer", message: "no answer queued" } });
      if (a instanceof Error) throw a;
      return a;
    });
  });

  it("asks under /api with the cookie, the header and JSON", async () => {
    answers.push(json(201, { username: "kim" }));
    expect(await client.post("/v1/users", { username: "kim" })).toEqual({ username: "kim" });
    expect(calls[0].url).toBe("/api/v1/users");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.credentials).toBe("same-origin");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("X-Simple-Docs")).toBe("1");
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(calls[0].init.body).toBe('{"username":"kim"}');
  });

  it("sends a file as it is, with its own type", async () => {
    answers.push(new Response(null, { status: 204 }));
    const logo = new Blob(["png"], { type: "image/png" });
    expect(await client.put("/v1/settings/org/logo", logo)).toBeUndefined();
    expect(calls[0].init.body).toBe(logo);
    expect(new Headers(calls[0].init.headers).get("Content-Type")).toBe("image/png");
  });

  it("gives the API's code, message and fields", async () => {
    answers.push(json(422, { error: { code: "invalid", message: "That username is taken.",
                                      fields: { username: "That username is taken." } } }));
    const e = (await client.post("/v1/users", {}).catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.status, e.code, e.message]).toEqual([422, "invalid", "That username is taken."]);
    expect(e.fields).toEqual({ username: "That username is taken." });
  });

  it("says so when the session has ended", async () => {
    const signedOut = vi.fn();
    client.onSignedOut = signedOut;
    answers.push(json(401, { error: { code: "signed_out", message: "You're signed out. Sign in again." } }));
    await expect(client.get("/v1/auth/me")).rejects.toBeInstanceOf(ApiError);
    expect(signedOut).toHaveBeenCalledOnce();
  });

  it("doesn't take a wrong password for an ended session", async () => {
    const signedOut = vi.fn();
    client.onSignedOut = signedOut;
    answers.push(json(401, { error: { code: "wrong_password", message: "Wrong username or password." } }));
    await expect(client.post("/v1/auth/sign-in", {})).rejects.toThrow("Wrong username or password.");
    expect(signedOut).not.toHaveBeenCalled();
  });

  it("says Simple Docs can't be reached when there is no proper answer", async () => {
    answers.push(new TypeError("Failed to fetch"));
    await expect(client.get("/v1/health")).rejects.toBeInstanceOf(Unreachable);
    answers.push(new Response("<html>Bad gateway</html>", { status: 502 }));
    await expect(client.get("/v1/health")).rejects.toThrow("Can't reach Simple Docs right now.");
  });

  it("puts any trouble into words", () => {
    expect(messageOf(new ApiError(409, "last_admin", "Make someone else an admin first."))).toBe(
      "Make someone else an admin first.");
    expect(messageOf(new Error("boom"))).toBe("Something went wrong. Try again.");
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/client.test.ts`
Expected: FAIL, `Failed to resolve import "../api/client"`.

**Step 3: Write the implementation**

`apps/desktop/src/api/types.ts`:
```ts
export type Role = "admin" | "editor" | "reviewer";

/** GET /v1/auth/me */
export interface Me {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  scopes: string[];
}

/** GET /v1/branding: needs no session. */
export interface Branding {
  setup_needed: boolean;
  org_name: string | null;
  logo_id: string | null;
}

/** GET /v1/users */
export interface User {
  id: string;
  username: string;
  display_name: string;
  role: Role;
  active: boolean;
  locked: boolean;
  last_sign_in_at: string | null;
  created_at: string;
}

/** GET /v1/settings/org */
export interface Org {
  name: string | null;
  abn: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_id: string | null;
}
```

`apps/desktop/src/api/client.ts`:
```ts
/** The desktop is an ordinary API client (rule 4). The session is an
 * httpOnly cookie the browser keeps and sends; no script here can read it.
 * Every request carries X-Simple-Docs: 1, which the API asks of anything
 * that changes something. Paths are the API's (/v1/...); Caddy, and Vite's
 * proxy in development, serve the API under /api. */

export const BASE = "/api";

export class ApiError extends Error {
  readonly status: number;
  /** For programs: wrong_password, locked, last_admin, ... */
  readonly code: string;
  /** A field's name → what is wrong with it, when the request had something wrong in it. */
  readonly fields: Record<string, string>;

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

/** The API could not be reached, or what answered wasn't the API. */
export class Unreachable extends Error {
  constructor() {
    super("Can't reach Simple Docs right now. Check it's running, then try again.");
  }
}

/** What to tell a person about something that went wrong. The API's
 * messages are written for people, so they are shown as they come. */
export function messageOf(e: unknown): string {
  return e instanceof ApiError || e instanceof Unreachable ? e.message : "Something went wrong. Try again.";
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

interface ErrorBody {
  error?: { code?: string; message?: string; fields?: Record<string, string> };
}

export class ApiClient {
  /** Called when the API says the session has ended. */
  onSignedOut: (() => void) | null = null;
  private readonly fetcher: Fetcher;

  constructor(fetcher?: Fetcher) {
    this.fetcher = fetcher ?? ((url, init) => fetch(url, init));
  }

  /** JSON, or a file (a Blob) sent as it is. */
  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { Accept: "application/json", "X-Simple-Docs": "1" };
    let payload: BodyInit | undefined;
    if (body instanceof Blob) {
      headers["Content-Type"] = body.type || "application/octet-stream";
      payload = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await this.fetcher(BASE + path, { method, headers, body: payload, credentials: "same-origin" });
    } catch {
      throw new Unreachable();
    }
    if (res.status === 204) return undefined as T;
    let parsed: unknown;
    try {
      const text = await res.text();
      parsed = text ? JSON.parse(text) : null;
    } catch {
      // a proxy's error page, say: not the API's own answer
      throw new Unreachable();
    }
    if (res.ok) return parsed as T;
    const error = (parsed as ErrorBody | null)?.error;
    if (!error?.code) throw new Unreachable();
    if (res.status === 401 && error.code === "signed_out") this.onSignedOut?.();
    throw new ApiError(res.status, error.code, error.message ?? `Simple Docs answered ${res.status}.`, error.fields ?? {});
  }

  get<T>(path: string) {
    return this.request<T>("GET", path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>("POST", path, body);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>("PUT", path, body);
  }

  patch<T>(path: string, body?: unknown) {
    return this.request<T>("PATCH", path, body);
  }

  delete<T>(path: string) {
    return this.request<T>("DELETE", path);
  }
}

export const api = new ApiClient();
```

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test`
Expected: `24 passed`.

**Step 5: Commit**

```
git add apps/desktop/src/api apps/desktop/src/test/client.test.ts
git commit -m "Give the desktop an API client: the session cookie, X-Simple-Docs and the error shape" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 21: Sign in and first run on the desktop

**Files:**
- Create: `apps/desktop/src/auth/AuthContext.tsx`, `apps/desktop/src/auth/guards.tsx`
- Create: `apps/desktop/src/ui/AuthFrame.tsx`
- Create: `apps/desktop/src/pages/SignIn.tsx`, `apps/desktop/src/pages/SetUp.tsx`
- Modify: `apps/desktop/src/App.tsx` (replace)
- Test: `apps/desktop/src/test/harness.tsx`, `apps/desktop/src/test/SignIn.test.tsx`, `apps/desktop/src/test/SetUp.test.tsx`

**Step 1: Write the failing tests**

`apps/desktop/src/test/harness.tsx`:
```tsx
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { AppRoutes } from "../App";
import { AuthProvider } from "../auth/AuthContext";
import type { Branding, Me } from "../api/types";

export function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** An answer in the API's error shape. */
export function apiError(status: number, code: string, message: string, fields?: Record<string, string>) {
  return json(status, { error: { code, message, ...(fields ? { fields } : {}) } });
}

export const ADA: Me = { id: "u-ada", username: "ada", display_name: "Ada Admin", role: "admin", scopes: ["*"] };

export const MEL: Me = {
  id: "u-mel", username: "mel", display_name: "Mel Grant", role: "editor",
  scopes: ["documents:read", "documents:write", "clients:read", "clients:write", "reviews:write"],
};

export const ACME: Branding = { setup_needed: false, org_name: "Acme Pty Ltd", logo_id: null };
export const FRESH: Branding = { setup_needed: true, org_name: null, logo_id: null };

export interface Call {
  method: string;
  url: string;
  body: unknown;
  headers: Headers;
}

export type Handler = (method: string, url: string, body: unknown) =>
  Response | null | undefined | Promise<Response | null | undefined>;

/** The API, stubbed. `more` answers first; then the branding (Acme), who is
 * signed in (Ada, an admin, unless `me` says otherwise; null is nobody) and
 * sign-out; anything else is a 404 in the API's shape. */
export function stubApi(more: Handler = () => null,
                        { me = ADA, branding = ACME }: { me?: Me | null; branding?: Branding } = {}) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    // JSON is read back; a file is kept as it was sent
    const body = typeof init.body === "string" ? JSON.parse(init.body) : init.body ?? undefined;
    calls.push({ method, url, body, headers: new Headers(init.headers) });
    const answer = await more(method, url, body);
    if (answer) return answer;
    if (url === "/api/v1/branding") return json(200, branding);
    if (url === "/api/v1/auth/me") {
      return me ? json(200, me) : apiError(401, "signed_out", "You're signed out. Sign in again.");
    }
    if (url === "/api/v1/auth/sign-out") return new Response(null, { status: 204 });
    return apiError(404, "not_found", `no stub for ${method} ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

function Where() {
  const { pathname } = useLocation();
  return <output data-testid="where">{pathname}</output>;
}

export function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AppRoutes />
        <Where />
      </AuthProvider>
    </MemoryRouter>,
  );
}
```

`apps/desktop/src/test/SignIn.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ACME, apiError, json, MEL, renderApp, stubApi } from "./harness";

async function signInAs(username: string, password: string) {
  await userEvent.type(await screen.findByLabelText("Username"), username);
  await userEvent.type(screen.getByLabelText("Password"), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("signing in", () => {
  it("sends someone signed out to sign in, under the organisation's name", async () => {
    stubApi(undefined, { me: null });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByText("Acme Pty Ltd on Simple Docs")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/sign-in");
  });

  it("signs someone in with their username and password", async () => {
    const { calls } = stubApi((method, url) =>
      method === "POST" && url === "/api/v1/auth/sign-in" ? json(200, MEL) : null, { me: null });
    renderApp("/sign-in");
    await signInAs("mel", "correct horse battery");
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/sign-in"));
    expect(calls.find((c) => c.url === "/api/v1/auth/sign-in")?.body).toEqual({
      username: "mel", password: "correct horse battery" });
  });

  it("says plainly why not", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/sign-in"
      ? apiError(401, "locked", "Too many wrong passwords. Try again in 15 minutes.") : null, { me: null });
    renderApp("/sign-in");
    await signInAs("mel", "nope");
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many wrong passwords. Try again in 15 minutes.");
    expect(screen.getByTestId("where")).toHaveTextContent("/sign-in");
  });

  it("shows the organisation's logo when it has one", async () => {
    stubApi(undefined, { me: null, branding: { ...ACME, logo_id: "logo-1" } });
    const { container } = renderApp("/sign-in");
    await screen.findByRole("heading", { name: "Sign in" });
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/v1/branding/logo?v=logo-1");
  });

  it("sends someone already signed in onwards", async () => {
    stubApi();
    renderApp("/sign-in");
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/sign-in"));
  });

  it("offers another try when Simple Docs can't be reached", async () => {
    let down = true;
    stubApi((_method, url) => {
      if (url === "/api/v1/branding" && down) throw new TypeError("Failed to fetch");
      return null;
    });
    renderApp("/");
    expect(await screen.findByRole("alert")).toHaveTextContent("Can't reach Simple Docs right now.");
    down = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
```

`apps/desktop/src/test/SetUp.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ADA, apiError, FRESH, json, renderApp, stubApi } from "./harness";

const RULE = "Use 2 to 64 letters, numbers, dots, dashes or underscores, starting with a letter or number.";

async function fillIn(again = "correct horse battery") {
  await userEvent.type(await screen.findByLabelText("Organisation"), "Acme Pty Ltd");
  await userEvent.type(screen.getByLabelText("Your name"), "Ada Admin");
  await userEvent.type(screen.getByLabelText("Username"), "ada");
  await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
  await userEvent.type(screen.getByLabelText("Password again"), again);
  await userEvent.click(screen.getByRole("button", { name: "Set up Simple Docs" }));
}

describe("first run", () => {
  it("sends a fresh install to first run", async () => {
    stubApi(undefined, { me: null, branding: FRESH });
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Set up Simple Docs" })).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/setup");
  });

  it("makes the first admin and signs them in", async () => {
    const { calls } = stubApi((method, url) =>
      method === "POST" && url === "/api/v1/setup" ? json(201, ADA) : null, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    await waitFor(() => expect(screen.getByTestId("where")).not.toHaveTextContent("/setup"));
    expect(calls.find((c) => c.url === "/api/v1/setup")?.body).toEqual({
      org_name: "Acme Pty Ltd", display_name: "Ada Admin", username: "ada", password: "correct horse battery" });
  });

  it("checks the passwords match before sending anything", async () => {
    const { calls } = stubApi(undefined, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn("something else entirely");
    expect(await screen.findByText("The passwords don't match.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/v1/setup")).toBe(false);
  });

  it("shows what the API says is wrong beside its field", async () => {
    stubApi((_method, url) => url === "/api/v1/setup"
      ? apiError(422, "invalid", RULE, { username: RULE }) : null, { me: null, branding: FRESH });
    renderApp("/setup");
    await fillIn();
    expect(await screen.findByText(RULE)).toBeInTheDocument();
    expect(screen.getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
  });

  it("sends anyone to sign in once Simple Docs is set up", async () => {
    stubApi(undefined, { me: null });
    renderApp("/setup");
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
  });
});
```

**Step 2: Run them to see them fail**

Run: `cd apps/desktop && npx vitest run src/test/SignIn.test.tsx src/test/SetUp.test.tsx`
Expected: FAIL, `Failed to resolve import "../auth/AuthContext"` (from the harness).

**Step 3: Write the implementation**

`apps/desktop/src/auth/AuthContext.tsx`:
```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, ApiError } from "../api/client";
import type { Branding, Me } from "../api/types";

export interface SetUpForm {
  org_name: string;
  display_name: string;
  username: string;
  password: string;
}

interface AuthState {
  /** The first look at the branding and who is signed in has finished. */
  ready: boolean;
  branding: Branding | null;
  me: Me | null;
  /** Why that look failed, kept so it can be tried again. */
  trouble: string | null;
  retry: () => void;
  reloadBranding: () => Promise<void>;
  signIn: (username: string, password: string) => Promise<void>;
  setUp: (form: SetUpForm) => Promise<void>;
  signOut: () => Promise<void>;
  can: (scope: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    api.onSignedOut = () => setMe(null);
    let live = true;
    (async () => {
      try {
        const found = await api.get<Branding>("/v1/branding");
        let who: Me | null = null;
        if (!found.setup_needed) {
          try {
            who = await api.get<Me>("/v1/auth/me");
          } catch (e) {
            // signed out is an answer, not trouble
            if (!(e instanceof ApiError && e.status === 401)) throw e;
          }
        }
        if (live) {
          setBranding(found);
          setMe(who);
          setTrouble(null);
        }
      } catch (e) {
        if (live) setTrouble((e as Error).message);
      } finally {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setReady(false);
    setAttempt((n) => n + 1);
  }, []);

  const reloadBranding = useCallback(async () => {
    setBranding(await api.get<Branding>("/v1/branding"));
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setMe(await api.post<Me>("/v1/auth/sign-in", { username, password }));
  }, []);

  const setUp = useCallback(async (form: SetUpForm) => {
    const admin = await api.post<Me>("/v1/setup", form);
    // both at once, so first run hands straight over to the signed-in app
    setMe(admin);
    setBranding({ setup_needed: false, org_name: form.org_name.trim(), logo_id: null });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post("/v1/auth/sign-out");
    } catch {
      /* signed out here whatever the API says */
    }
    setMe(null);
  }, []);

  const can = useCallback((scope: string) => {
    if (!me) return false;
    const area = scope.split(":")[0];
    return me.scopes.includes("*") || me.scopes.includes(scope) || me.scopes.includes(`${area}:*`);
  }, [me]);

  const value = useMemo(
    () => ({ ready, branding, me, trouble, retry, reloadBranding, signIn, setUp, signOut, can }),
    [ready, branding, me, trouble, retry, reloadBranding, signIn, setUp, signOut, can],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
```

`apps/desktop/src/ui/AuthFrame.tsx`:
```tsx
import type { ReactNode } from "react";

/** Sign in, first run and trouble: one card in the middle of the star field. */
export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="relative z-10 grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
```

`apps/desktop/src/auth/guards.tsx`:
```tsx
import { Navigate, Outlet } from "react-router-dom";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent } from "../ui/Card";
import { Notice } from "../ui/Notice";
import { useAuth } from "./AuthContext";

export function Loading() {
  return <p className="relative z-10 p-6 text-body-sm text-space-gray">Loading…</p>;
}

export function Trouble({ message, retry }: { message: string; retry: () => void }) {
  return (
    <AuthFrame>
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Notice>{message}</Notice>
          <Button onClick={retry}>Try again</Button>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}

/** Signed in, or off to first run or sign in. */
export function RequireAuth() {
  const { ready, branding, me, trouble, retry } = useAuth();
  if (!ready) return <Loading />;
  if (trouble) return <Trouble message={trouble} retry={retry} />;
  if (branding?.setup_needed) return <Navigate to="/setup" replace />;
  if (!me) return <Navigate to="/sign-in" replace />;
  return <Outlet />;
}

/** A page for those whose role carries `scope`; anyone else goes home. */
export function RequireScope({ scope }: { scope: string }) {
  const { can } = useAuth();
  return can(scope) ? <Outlet /> : <Navigate to="/" replace />;
}
```

`apps/desktop/src/pages/SignIn.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { messageOf } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Loading } from "../auth/guards";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { OrgMark } from "../ui/OrgMark";

export function SignIn() {
  const { ready, branding, me, signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (branding?.setup_needed) return <Navigate to="/setup" replace />;
  if (me) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await signIn(username, password);
    } catch (err) {
      setProblem(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader className="items-center text-center">
          <OrgMark logoId={branding?.logo_id ?? null} size={48} />
          <CardTitle level={1}>Sign in</CardTitle>
          <CardDescription>{branding?.org_name ? `${branding.org_name} on Simple Docs` : "Simple Docs"}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {problem && <Notice>{problem}</Notice>}
            <TextField label="Username" name="username" autoComplete="username" autoCapitalize="none"
                       spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />
            <TextField label="Password" name="password" type="password" autoComplete="current-password"
                       value={password} onChange={(e) => setPassword(e.target.value)} required />
            <Button type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}
```

`apps/desktop/src/pages/SetUp.tsx`:
```tsx
import { useState, type ChangeEvent, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { ApiError, messageOf } from "../api/client";
import { useAuth, type SetUpForm } from "../auth/AuthContext";
import { Loading } from "../auth/guards";
import { AuthFrame } from "../ui/AuthFrame";
import { Button } from "../ui/Button";
import { Card, CardContent, CardHeader } from "../ui/Card";
import { TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { SectionHeading } from "../ui/SectionHeading";
import { SimpleDocsMark } from "../ui/SimpleDocsMark";

const EMPTY: SetUpForm = { org_name: "", display_name: "", username: "", password: "" };

/** First run: the organisation's name and the first admin. The rest of the
 * organisation's details wait in Settings, where first run ends. */
export function SetUp() {
  const { ready, branding, me, setUp } = useAuth();
  const [form, setForm] = useState(EMPTY);
  const [again, setAgain] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (!branding?.setup_needed) return <Navigate to={me ? "/settings/org" : "/sign-in"} replace />;

  const set = (key: keyof SetUpForm) => (e: ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setProblem(null);
    if (form.password !== again) {
      setFields({ again: "The passwords don't match." });
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await setUp(form);
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else setProblem(messageOf(err));
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <Card>
        <CardHeader className="gap-4">
          <SimpleDocsMark size={40} />
          <SectionHeading accentText="Set up"
                          description="Name your organisation and make the first admin. The rest can wait for Settings.">
            Simple Docs
          </SectionHeading>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} noValidate className="flex flex-col gap-4">
            {problem && <Notice>{problem}</Notice>}
            <TextField label="Organisation" hint="As your documents should name it." autoComplete="organization"
                       value={form.org_name} onChange={set("org_name")} error={fields.org_name} required />
            <TextField label="Your name" autoComplete="name" value={form.display_name}
                       onChange={set("display_name")} error={fields.display_name} required />
            <TextField label="Username" hint="What you'll sign in with." autoComplete="username"
                       autoCapitalize="none" spellCheck={false} value={form.username}
                       onChange={set("username")} error={fields.username} required />
            <TextField label="Password" type="password" hint="At least 12 characters." autoComplete="new-password"
                       value={form.password} onChange={set("password")} error={fields.password} required />
            <TextField label="Password again" type="password" autoComplete="new-password" value={again}
                       onChange={(e) => setAgain(e.target.value)} error={fields.again} required />
            <Button type="submit" disabled={busy}>{busy ? "Setting up…" : "Set up Simple Docs"}</Button>
          </form>
        </CardContent>
      </Card>
    </AuthFrame>
  );
}
```

`apps/desktop/src/App.tsx` (replace; Task 22 puts the shell where `SignedIn` is):
```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth } from "./auth/guards";
import { SetUp } from "./pages/SetUp";
import { SignIn } from "./pages/SignIn";
import { StarField } from "./ui/StarField";

/** Until the shell (Task 22). */
function SignedIn() {
  return (
    <main id="main" className="relative z-10 p-8">
      <h1 className="text-section-title-sm">Signed in</h1>
    </main>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/setup" element={<SetUp />} />
      <Route element={<RequireAuth />}>
        <Route index element={<SignedIn />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <StarField />
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

**Step 4: Run them to see them pass**

Run: `cd apps/desktop && npm test`
Expected: `35 passed`.

**Step 5: Commit**

```
git add apps/desktop/src/auth apps/desktop/src/ui/AuthFrame.tsx apps/desktop/src/pages/SignIn.tsx \
  apps/desktop/src/pages/SetUp.tsx apps/desktop/src/App.tsx apps/desktop/src/test/harness.tsx \
  apps/desktop/src/test/SignIn.test.tsx apps/desktop/src/test/SetUp.test.tsx
git commit -m "Sign in to the desktop, and set up a fresh install from it" \
  -m "The sign-in page carries the organisation's name and logo; first run makes the first admin and hands straight over." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 22: The app shell: skip link, the design's navbar, and honest empty pages

**Files:**
- Create: `apps/desktop/src/ui/Layout.tsx`
- Create: `apps/desktop/src/pages/Soon.tsx`
- Modify: `apps/desktop/src/App.tsx` (the routes)
- Test: `apps/desktop/src/test/Shell.test.tsx`

**Step 1: Write the failing test**

`apps/desktop/src/test/Shell.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MEL, renderApp, stubApi } from "./harness";

async function mainLinks() {
  const nav = await screen.findByRole("navigation", { name: "Main" });
  return within(nav).getAllByRole("link").map((a) => a.textContent);
}

describe("the app shell", () => {
  it("opens on Documents, saying when it arrives", async () => {
    stubApi();
    renderApp("/");
    expect(await screen.findByRole("heading", { level: 1, name: "Documents" })).toBeInTheDocument();
    expect(screen.getByText("Arrives in step 2")).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent("/documents");
  });

  it("gives an admin the design's navbar", async () => {
    stubApi();
    renderApp("/documents");
    expect(await mainLinks()).toEqual(["Documents", "Clients", "Templates", "Spend"]);
    expect(screen.getByRole("link", { name: "Simple Docs" })).toHaveAttribute("href", "/documents");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.getByRole("link", { name: /Ada Admin/ })).toHaveAttribute("href", "/account");
  });

  it("shows an editor only what an editor can open", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/documents");
    expect(await mainLinks()).toEqual(["Documents", "Clients"]);
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
  });

  it("sends an editor away from an admin's page", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/spend");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/documents"));
  });

  it.each([
    { path: "/clients", title: "Clients", step: 2 },
    { path: "/templates", title: "Templates", step: 7 },
    { path: "/spend", title: "Spend", step: 3 },
  ])("says when $path arrives", async ({ path, title, step }) => {
    stubApi();
    renderApp(path);
    expect(await screen.findByRole("heading", { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText(`Arrives in step ${step}`)).toBeInTheDocument();
  });

  it("puts the skip link first", async () => {
    stubApi();
    renderApp("/documents");
    await screen.findByRole("heading", { name: "Documents" });
    await userEvent.tab();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveFocus();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main");
    expect(document.getElementById("main")?.tagName).toBe("MAIN");
  });

  it("signs out and goes back to sign in", async () => {
    const { calls } = stubApi();
    renderApp("/documents");
    await userEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST" && c.url === "/api/v1/auth/sign-out")).toBe(true);
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/Shell.test.tsx`
Expected: FAIL, `Unable to find role="heading" and name "Documents"` (the placeholder says "Signed in").

**Step 3: Write the implementation**

`apps/desktop/src/ui/Layout.tsx`:
```tsx
import { LogOut, Settings } from "lucide-react";
import { Link, NavLink, Outlet } from "react-router-dom";
import type { Role } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { cn } from "./cn";
import { OrgMark } from "./OrgMark";

export const ROLE_NAMES: Record<Role, string> = { admin: "Admin", editor: "Editor", reviewer: "Reviewer" };

export const navLink = ({ isActive }: { isActive: boolean }) =>
  cn(
    "inline-flex h-10 items-center gap-2 rounded-md px-3 text-label transition-colors",
    isActive ? "bg-space-blue/10 text-space-lightGray" : "text-space-gray hover:text-space-lightGray",
  );

/** The app's frame: a skip link first (the design system keeps it there),
 * then the design's navbar: Simple Docs · Documents · Clients · Templates ·
 * Spend, with you on the right. Templates and Spend are admins' screens. */
export function Layout() {
  const { me, branding, can, signOut } = useAuth();
  const links = [
    { to: "/documents", label: "Documents", show: true },
    { to: "/clients", label: "Clients", show: true },
    { to: "/templates", label: "Templates", show: can("templates:write") },
    { to: "/spend", label: "Spend", show: can("spend:read") },
  ];
  return (
    <>
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-space-blue px-4 py-2 text-label text-space-darkBlue focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Skip to main content
      </a>
      <header className="sticky top-0 z-40 border-b border-space-blue/20 bg-space-darkBlue/80 backdrop-blur-sm">
        <div className="mx-auto flex h-navbar max-w-shell items-center gap-6 px-4">
          <Link to="/documents" className="flex items-center gap-2.5 text-subhead text-space-lightGray">
            <OrgMark logoId={branding?.logo_id ?? null} size={32} />
            Simple Docs
          </Link>
          <nav aria-label="Main">
            <ul className="flex items-center gap-1">
              {links.filter((l) => l.show).map((l) => (
                <li key={l.to}>
                  <NavLink to={l.to} className={navLink}>{l.label}</NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {me && (
              <NavLink to="/account" className={navLink}>
                {me.display_name}
                <Badge tone="gray">{ROLE_NAMES[me.role]}</Badge>
              </NavLink>
            )}
            {can("settings:write") && (
              <NavLink to="/settings" className={navLink} aria-label="Settings">
                <Settings aria-hidden="true" className="h-5 w-5" />
              </NavLink>
            )}
            <Button variant="ghost" onClick={() => void signOut()}>
              <LogOut aria-hidden="true" />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="relative z-10 mx-auto max-w-shell px-4 py-10">
        <Outlet />
      </main>
    </>
  );
}
```

`apps/desktop/src/pages/Soon.tsx`:
```tsx
import { Card } from "../ui/Card";
import { Chip } from "../ui/Chip";
import { SectionHeading } from "../ui/SectionHeading";

/** A screen that isn't built yet, saying so and which build step brings it
 * (the design's build steps), rather than pretending. */
export function Soon({ title, step, what }: { title: string; step: number; what: string }) {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText={title} />
      <Card className="max-w-panel p-8">
        <Chip tone="meta">Arrives in step {step}</Chip>
        <p className="mt-4 text-body text-space-gray">{what}</p>
      </Card>
    </div>
  );
}

export const SOON = {
  documents: {
    title: "Documents", step: 2,
    what: "Documents written from a template, with every version kept and any one restored, arrive in step 2. Writing them with AI follows in step 3.",
  },
  clients: {
    title: "Clients", step: 2,
    what: "Clients and their projects, each with the documents written for them, arrive in step 2. Bringing them in from monkiro follows in step 8.",
  },
  templates: {
    title: "Templates", step: 7,
    what: "Editing templates here, with a form builder, a test run and publishing, arrives in step 7. The first five starter templates come with documents in step 2.",
  },
  spend: {
    title: "Spend", step: 3,
    what: "What writing with AI costs this month against your budget, by model, template and person, arrives with it in step 3.",
  },
};
```

`apps/desktop/src/App.tsx`: replace the imports and `AppRoutes`, and remove `SignedIn`:
```tsx
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { RequireAuth, RequireScope } from "./auth/guards";
import { SetUp } from "./pages/SetUp";
import { SignIn } from "./pages/SignIn";
import { SOON, Soon } from "./pages/Soon";
import { Layout } from "./ui/Layout";
import { StarField } from "./ui/StarField";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/setup" element={<SetUp />} />
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/documents" replace />} />
          <Route path="/documents" element={<Soon {...SOON.documents} />} />
          <Route path="/clients" element={<Soon {...SOON.clients} />} />
          <Route element={<RequireScope scope="templates:write" />}>
            <Route path="/templates" element={<Soon {...SOON.templates} />} />
          </Route>
          <Route element={<RequireScope scope="spend:read" />}>
            <Route path="/spend" element={<Soon {...SOON.spend} />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
```
(`App` itself is unchanged.)

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test`
Expected: `44 passed`.

**Step 5: Commit**

```
git add apps/desktop/src/ui/Layout.tsx apps/desktop/src/pages/Soon.tsx apps/desktop/src/App.tsx \
  apps/desktop/src/test/Shell.test.tsx
git commit -m "Give the desktop its shell: a skip link, the design's navbar and pages that say when they arrive" \
  -m "Templates and Spend show for admins only. Documents and Clients arrive in step 2, Spend in step 3, Templates in step 7." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 23: Settings → Users on the desktop

**Files:**
- Create: `apps/desktop/src/pages/Settings.tsx`, `apps/desktop/src/pages/Users.tsx`
- Modify: `apps/desktop/src/App.tsx` (the Settings routes)
- Test: `apps/desktop/src/test/Users.test.tsx`

**Step 1: Write the failing test**

`apps/desktop/src/test/Users.test.tsx`:
```tsx
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { User } from "../api/types";
import { apiError, json, MEL, renderApp, stubApi, type Handler } from "./harness";

const USERS: User[] = [
  { id: "u-ada", username: "ada", display_name: "Ada Admin", role: "admin", active: true, locked: false,
    last_sign_in_at: "2026-10-19T09:00:00Z", created_at: "2026-10-19T08:00:00Z" },
  { id: "u-mel", username: "mel", display_name: "Mel Grant", role: "editor", active: true, locked: true,
    last_sign_in_at: null, created_at: "2026-10-19T08:10:00Z" },
  { id: "u-old", username: "old", display_name: "Old Timer", role: "reviewer", active: false, locked: false,
    last_sign_in_at: null, created_at: "2026-10-19T08:20:00Z" },
];

function usersApi(extra: Handler = () => null) {
  return stubApi(async (method, url, body) => {
    const answer = await extra(method, url, body);
    if (answer) return answer;
    if (method === "GET" && url === "/api/v1/users") return json(200, { items: USERS });
    return null;
  });
}

async function addSomeone(name: string, username: string, role: string, password: string) {
  const form = await screen.findByRole("form", { name: "Add someone" });
  await userEvent.type(within(form).getByLabelText("Name"), name);
  await userEvent.type(within(form).getByLabelText("Username"), username);
  await userEvent.selectOptions(within(form).getByLabelText("Role"), role);
  await userEvent.type(within(form).getByLabelText("Password"), password);
  await userEvent.click(within(form).getByRole("button", { name: "Add" }));
  return form;
}

describe("Settings → Users", () => {
  it("opens Settings on Users and lists everyone with their role and state", async () => {
    usersApi();
    renderApp("/settings");
    const table = await screen.findByRole("table");
    expect(screen.getByTestId("where")).toHaveTextContent("/settings/users");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getByRole("rowheader").textContent)).toEqual(["Ada Admin", "Mel Grant", "Old Timer"]);
    expect(within(rows[1]).getByText("Locked")).toBeInTheDocument();
    expect(within(rows[2]).getByText("Deactivated")).toBeInTheDocument();
    expect(screen.getByLabelText("Role for Mel Grant")).toHaveValue("editor");
  });

  it("adds someone", async () => {
    const { calls } = usersApi((method, url) =>
      method === "POST" && url === "/api/v1/users" ? json(201, USERS[1]) : null);
    renderApp("/settings/users");
    await addSomeone("Kim Lee", "kim", "reviewer", "another long password");
    expect(await screen.findByRole("status")).toHaveTextContent("Kim Lee can sign in now.");
    expect(calls.find((c) => c.method === "POST" && c.url === "/api/v1/users")?.body).toEqual({
      display_name: "Kim Lee", username: "kim", role: "reviewer", password: "another long password" });
  });

  it("shows what is wrong beside the field", async () => {
    usersApi((method, url) => method === "POST" && url === "/api/v1/users"
      ? apiError(422, "invalid", "That username is taken.", { username: "That username is taken." }) : null);
    renderApp("/settings/users");
    const form = await addSomeone("Mel Two", "mel", "editor", "another long password");
    expect(await within(form).findByText("That username is taken.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Username")).toHaveAttribute("aria-invalid", "true");
  });

  it("changes someone's role", async () => {
    const { calls } = usersApi((method) => method === "PATCH" ? json(200, { ...USERS[1], role: "reviewer" }) : null);
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Mel Grant"), "reviewer");
    expect(await screen.findByRole("status")).toHaveTextContent("Mel Grant is a reviewer now.");
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/v1/users/u-mel", body: { role: "reviewer" } });
  });

  it("deactivates and brings back, but never offers to deactivate you", async () => {
    const { calls } = usersApi((method) => method === "PATCH" ? json(200, USERS[1]) : null);
    renderApp("/settings/users");
    await userEvent.click(await screen.findByRole("button", { name: "Deactivate Mel Grant" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Mel Grant is deactivated");
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ active: false });
    expect(screen.getByRole("button", { name: "Reactivate Old Timer" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Deactivate Ada Admin" })).toBeNull();
  });

  it("says why the last admin can't step down", async () => {
    usersApi((method) => method === "PATCH"
      ? apiError(409, "last_admin", "Simple Docs needs at least one active admin. Make someone else an admin first.")
      : null);
    renderApp("/settings/users");
    await userEvent.selectOptions(await screen.findByLabelText("Role for Ada Admin"), "editor");
    expect(await screen.findByRole("alert")).toHaveTextContent("Simple Docs needs at least one active admin.");
  });

  it("sets someone's password", async () => {
    const { calls } = usersApi((method, url) =>
      method === "POST" && url === "/api/v1/users/u-mel/password" ? new Response(null, { status: 204 }) : null);
    renderApp("/settings/users");
    await userEvent.click(await screen.findByRole("button", { name: "Set password for Mel Grant" }));
    const form = screen.getByRole("form", { name: "New password for Mel Grant" });
    await userEvent.type(within(form).getByLabelText("New password"), "a brand new password");
    await userEvent.click(within(form).getByRole("button", { name: "Save password" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Mel Grant's password is set.");
    expect(calls.find((c) => c.url === "/api/v1/users/u-mel/password")?.body).toEqual({ password: "a brand new password" });
  });

  it("keeps Settings for admins", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/settings/users");
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/documents"));
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/Users.test.tsx`
Expected: FAIL, `Unable to find role="table"` (there is no `/settings` route yet, so it lands on Documents).

**Step 3: Write the implementation**

`apps/desktop/src/pages/Settings.tsx` (Task 24 adds the Organisation tab):
```tsx
import { NavLink, Outlet } from "react-router-dom";
import { SectionHeading } from "../ui/SectionHeading";
import { navLink } from "../ui/Layout";

const TABS = [{ to: "/settings/users", label: "Users" }];

/** Settings, for admins: who signs in, and the organisation. Later steps add
 * models, budget and caps, ignore and redaction patterns, and connectors. */
export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText="Settings" description="Who signs in, and the organisation your documents speak for." />
      <nav aria-label="Settings">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink to={t.to} className={navLink}>{t.label}</NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </div>
  );
}
```

`apps/desktop/src/pages/Users.tsx`:
```tsx
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { api, ApiError, messageOf } from "../api/client";
import type { Role, User } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { Select, SelectField, TextField } from "../ui/Field";
import { ROLE_NAMES } from "../ui/Layout";
import { Notice } from "../ui/Notice";

const ROLES: Role[] = ["admin", "editor", "reviewer"];
const EMPTY = { display_name: "", username: "", role: "editor" as Role, password: "" };

function asA(role: Role): string {
  return role === "admin" ? "an admin" : `a ${role}`;
}

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "Never";
}

function State({ user }: { user: User }) {
  if (!user.active) return <Badge tone="gray">Deactivated</Badge>;
  if (user.locked) return <Badge tone="gold">Locked</Badge>;
  return <Badge tone="green">Active</Badge>;
}

export function Users() {
  const { me } = useAuth();
  const [users, setUsers] = useState<User[] | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [passwordFor, setPasswordFor] = useState<User | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api.get<{ items: User[] }>("/v1/users")).items);
    } catch (e) {
      setProblem(messageOf(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function say(message: string | null, trouble: string | null = null) {
    setDone(message);
    setProblem(trouble);
  }

  async function change(user: User, patch: { role?: Role; active?: boolean }, said: string) {
    say(null);
    try {
      await api.patch(`/v1/users/${user.id}`, patch);
      say(said);
    } catch (e) {
      say(null, messageOf(e));
    }
    await load();
  }

  async function add(e: FormEvent) {
    e.preventDefault();
    setFields({});
    say(null);
    try {
      await api.post("/v1/users", form);
      say(`${form.display_name.trim()} can sign in now.`);
      setForm(EMPTY);
      await load();
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else say(null, messageOf(err));
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {problem && <Notice>{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

      <Card>
        <CardHeader>
          <CardTitle>People who sign in</CardTitle>
          <CardDescription>
            Deactivate someone who leaves: they can't sign in, and their name stays on what they wrote.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {users === null ? (
            <p className="text-body-sm text-space-gray">Loading…</p>
          ) : (
            <table className="w-full text-left text-body-sm">
              <thead className="text-caption text-space-gray">
                <tr>
                  <th scope="col" className="py-2 pr-4 font-medium">Name</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Username</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Role</th>
                  <th scope="col" className="py-2 pr-4 font-medium">State</th>
                  <th scope="col" className="py-2 pr-4 font-medium">Last signed in</th>
                  <th scope="col" className="py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-space-blue/10">
                    <th scope="row" className="py-3 pr-4 font-medium text-space-lightGray">{u.display_name}</th>
                    <td className="py-3 pr-4 text-space-gray">{u.username}</td>
                    <td className="py-3 pr-4">
                      <div className="w-36">
                        <Select
                          aria-label={`Role for ${u.display_name}`}
                          value={u.role}
                          disabled={!u.active}
                          onChange={(e) => {
                            const role = e.target.value as Role;
                            void change(u, { role }, `${u.display_name} is ${asA(role)} now.`);
                          }}
                        >
                          {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
                        </Select>
                      </div>
                    </td>
                    <td className="py-3 pr-4"><State user={u} /></td>
                    <td className="py-3 pr-4 text-space-gray">{when(u.last_sign_in_at)}</td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setPasswordFor(u)}>
                          <KeyRound aria-hidden="true" />
                          Set password<span className="sr-only"> for {u.display_name}</span>
                        </Button>
                        {u.id !== me?.id && (u.active ? (
                          <Button variant="ghost" size="sm"
                                  onClick={() => void change(u, { active: false }, `${u.display_name} is deactivated and signed out.`)}>
                            Deactivate<span className="sr-only"> {u.display_name}</span>
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm"
                                  onClick={() => void change(u, { active: true }, `${u.display_name} can sign in again.`)}>
                            Reactivate<span className="sr-only"> {u.display_name}</span>
                          </Button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {passwordFor && (
        <SetPassword
          key={passwordFor.id}
          user={passwordFor}
          onCancel={() => setPasswordFor(null)}
          onDone={(said) => {
            setPasswordFor(null);
            say(said);
            void load();
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add someone</CardTitle>
          <CardDescription>
            Editors write documents, reviewers approve them, admins look after Settings, templates and spend.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={add} noValidate aria-label="Add someone" className="grid max-w-panel gap-4 md:grid-cols-2">
            <TextField label="Name" autoComplete="off" value={form.display_name}
                       onChange={(e) => setForm({ ...form, display_name: e.target.value })} error={fields.display_name} />
            <TextField label="Username" autoComplete="off" autoCapitalize="none" spellCheck={false} value={form.username}
                       onChange={(e) => setForm({ ...form, username: e.target.value })} error={fields.username} />
            <SelectField label="Role" value={form.role} error={fields.role}
                         onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_NAMES[r]}</option>)}
            </SelectField>
            <TextField label="Password" type="password" autoComplete="new-password" hint="At least 12 characters. Tell them yourself."
                       value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} error={fields.password} />
            <div className="md:col-span-2">
              <Button type="submit"><UserPlus aria-hidden="true" />Add</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function SetPassword({ user, onDone, onCancel }: { user: User; onDone: (said: string) => void; onCancel: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const title = `New password for ${user.display_name}`;

  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/v1/users/${user.id}/password`, { password });
      onDone(`${user.display_name}'s password is set. They're signed out everywhere until they use it.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.fields.password ?? err.message : messageOf(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>It also clears a lock after too many wrong passwords.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} noValidate aria-label={title} className="flex flex-wrap items-start gap-3">
          <TextField label="New password" type="password" autoComplete="new-password" hint="At least 12 characters."
                     value={password} onChange={(e) => setPassword(e.target.value)} error={error} className="min-w-64 flex-1" />
          <div className="flex gap-2 pt-7">
            <Button type="submit">Save password</Button>
            <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
```

In `apps/desktop/src/App.tsx`, import the two pages:
```tsx
import { SettingsLayout } from "./pages/Settings";
import { Users } from "./pages/Users";
```
and add inside the `Layout` route, after the Spend route:
```tsx
          <Route element={<RequireScope scope="settings:write" />}>
            <Route path="/settings" element={<SettingsLayout />}>
              <Route index element={<Navigate to="/settings/users" replace />} />
              <Route path="users" element={<Users />} />
            </Route>
          </Route>
```

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test`
Expected: `52 passed`.

**Step 5: Commit**

```
git add apps/desktop/src/pages/Settings.tsx apps/desktop/src/pages/Users.tsx apps/desktop/src/App.tsx \
  apps/desktop/src/test/Users.test.tsx
git commit -m "Look after users on the desktop: add, change role, set a password, deactivate and bring back" \
  -m "Nobody is offered their own Deactivate; the API's reasons (the last admin, a taken username) show where they belong." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 24: Settings → Organisation on the desktop: details and logo

**Files:**
- Create: `apps/desktop/src/pages/OrgSettings.tsx`
- Modify: `apps/desktop/src/pages/Settings.tsx` (the Organisation tab)
- Modify: `apps/desktop/src/App.tsx` (the route)
- Test: `apps/desktop/src/test/Org.test.tsx`

**Step 1: Write the failing test**

`apps/desktop/src/test/Org.test.tsx`:
```tsx
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Org } from "../api/types";
import { ACME, ADA, apiError, FRESH, json, renderApp, stubApi, type Handler } from "./harness";

const ORG: Org = {
  name: "Acme Pty Ltd", abn: "51 824 753 556", phone: null, email: "office@acme.com.au",
  address: "1 Collins Street\nMelbourne VIC 3000", logo_id: null,
};

function orgApi(extra: Handler = () => null, branding = ACME) {
  return stubApi(async (method, url, body) => {
    const answer = await extra(method, url, body);
    if (answer) return answer;
    if (method === "GET" && url === "/api/v1/settings/org") return json(200, { ...ORG, logo_id: branding.logo_id });
    return null;
  }, { branding });
}

describe("Settings → Organisation", () => {
  it("shows the organisation's details", async () => {
    orgApi();
    renderApp("/settings/org");
    expect(await screen.findByLabelText("Name")).toHaveValue("Acme Pty Ltd");
    expect(screen.getByLabelText("ABN")).toHaveValue("51 824 753 556");
    expect(screen.getByLabelText("Phone")).toHaveValue("");
    expect(screen.getByLabelText("Address")).toHaveValue("1 Collins Street\nMelbourne VIC 3000");
    expect(screen.getByRole("link", { name: "Organisation" })).toHaveAttribute("href", "/settings/org");
  });

  it("saves them, and the new name shows everywhere", async () => {
    const { calls } = orgApi((method, url, body) => method === "PUT" && url === "/api/v1/settings/org"
      ? json(200, { ...ORG, ...(body as object) }) : null);
    renderApp("/settings/org");
    await userEvent.type(await screen.findByLabelText("Phone"), "03 9000 0000");
    await userEvent.click(screen.getByRole("button", { name: "Save details" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ name: "Acme Pty Ltd", phone: "03 9000 0000" });
    expect(calls.filter((c) => c.url === "/api/v1/branding")).toHaveLength(2);
  });

  it("shows an ABN the API refuses beside the field", async () => {
    orgApi((method) => method === "PUT"
      ? apiError(422, "invalid", "That isn't a valid ABN. Check the 11 digits.",
                 { abn: "That isn't a valid ABN. Check the 11 digits." }) : null);
    renderApp("/settings/org");
    await userEvent.click(await screen.findByRole("button", { name: "Save details" }));
    expect(await screen.findByText("That isn't a valid ABN. Check the 11 digits.")).toBeInTheDocument();
    expect(screen.getByLabelText("ABN")).toHaveAttribute("aria-invalid", "true");
  });

  it("uploads a logo as it is", async () => {
    const { calls } = orgApi((method, url) => method === "PUT" && url === "/api/v1/settings/org/logo"
      ? new Response(null, { status: 204 }) : null);
    renderApp("/settings/org");
    const logo = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Upload logo"), logo);
    expect(await screen.findByRole("status")).toHaveTextContent("Logo updated.");
    const sent = calls.find((c) => c.url === "/api/v1/settings/org/logo");
    expect(sent?.body).toBe(logo);
    expect(sent?.headers.get("Content-Type")).toBe("image/png");
  });

  it("refuses a logo over 512 KB before sending it", async () => {
    const { calls } = orgApi();
    renderApp("/settings/org");
    const big = new File([new Uint8Array(512 * 1024 + 1)], "big.png", { type: "image/png" });
    await userEvent.upload(await screen.findByLabelText("Upload logo"), big);
    expect(await screen.findByRole("alert")).toHaveTextContent("The logo can be 512 KB at most.");
    expect(calls.some((c) => c.url === "/api/v1/settings/org/logo")).toBe(false);
  });

  it("removes the logo", async () => {
    const { calls } = orgApi((method, url) => method === "DELETE" && url === "/api/v1/settings/org/logo"
      ? new Response(null, { status: 204 }) : null, { ...ACME, logo_id: "logo-1" });
    renderApp("/settings/org");
    await userEvent.click(await screen.findByRole("button", { name: "Remove logo" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Logo removed.");
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
  });

  it("is where first run ends", async () => {
    stubApi((method, url) => {
      if (method === "POST" && url === "/api/v1/setup") return json(201, ADA);
      if (url === "/api/v1/settings/org") return json(200, ORG);
      return null;
    }, { me: null, branding: FRESH });
    renderApp("/setup");
    await userEvent.type(await screen.findByLabelText("Organisation"), "Acme Pty Ltd");
    await userEvent.type(screen.getByLabelText("Your name"), "Ada Admin");
    await userEvent.type(screen.getByLabelText("Username"), "ada");
    await userEvent.type(screen.getByLabelText("Password"), "correct horse battery");
    await userEvent.type(screen.getByLabelText("Password again"), "correct horse battery");
    await userEvent.click(screen.getByRole("button", { name: "Set up Simple Docs" }));
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent("/settings/org"));
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/Org.test.tsx`
Expected: FAIL, `Unable to find a label with the text of: Name` (no `/settings/org` route yet).

**Step 3: Write the implementation**

`apps/desktop/src/pages/OrgSettings.tsx`:
```tsx
import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { Upload } from "lucide-react";
import { api, ApiError, messageOf } from "../api/client";
import type { Org } from "../api/types";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextAreaField, TextField } from "../ui/Field";
import { Notice } from "../ui/Notice";
import { OrgMark } from "../ui/OrgMark";

interface OrgForm {
  name: string;
  abn: string;
  phone: string;
  email: string;
  address: string;
}

const MAX_LOGO = 512 * 1024;
const KINDS = ["image/png", "image/jpeg"];

function toForm(o: Org): OrgForm {
  return { name: o.name ?? "", abn: o.abn ?? "", phone: o.phone ?? "", email: o.email ?? "", address: o.address ?? "" };
}

// the outline Button's look, on the label that opens the file picker
const PICK =
  "inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-space-blue/30 px-4 text-label " +
  "text-space-lightGray hover:border-space-blue/50 hover:bg-space-blue/10 " +
  "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring [&_svg]:size-4";

export function OrgSettings() {
  const { branding, reloadBranding } = useAuth();
  const [form, setForm] = useState<OrgForm | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.get<Org>("/v1/settings/org").then(
      (o) => { if (live) setForm(toForm(o)); },
      (e) => { if (live) setProblem(messageOf(e)); },
    );
    return () => {
      live = false;
    };
  }, []);

  function say(message: string | null, trouble: string | null = null) {
    setDone(message);
    setProblem(trouble);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setFields({});
    say(null);
    try {
      setForm(toForm(await api.put<Org>("/v1/settings/org", form)));
      await reloadBranding();
      say("Saved. Documents use these details from now on.");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else say(null, messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    say(null);
    // the API checks both too; this saves sending a file it would refuse
    if (!KINDS.includes(file.type)) return say(null, "Use a PNG or JPEG for the logo.");
    if (file.size > MAX_LOGO) return say(null, "The logo can be 512 KB at most.");
    try {
      await api.put("/v1/settings/org/logo", file);
      await reloadBranding();
      say("Logo updated.");
    } catch (err) {
      say(null, messageOf(err));
    }
  }

  async function removeLogo() {
    say(null);
    try {
      await api.delete("/v1/settings/org/logo");
      await reloadBranding();
      say("Logo removed. Simple Docs shows its own mark instead.");
    } catch (err) {
      say(null, messageOf(err));
    }
  }

  const edit = (key: keyof OrgForm) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    form && setForm({ ...form, [key]: e.target.value });

  return (
    <div className="flex flex-col gap-8">
      {problem && <Notice>{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}

      <Card>
        <CardHeader>
          <CardTitle>Logo</CardTitle>
          <CardDescription>
            Shown beside Simple Docs here and on the sign-in page, and on your documents' covers from step 5. PNG or
            JPEG, 512 KB at most.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <OrgMark logoId={branding?.logo_id ?? null} size={64} />
          <label className={PICK}>
            <Upload aria-hidden="true" />
            {branding?.logo_id ? "Replace logo" : "Upload logo"}
            <input type="file" accept="image/png,image/jpeg" className="sr-only" onChange={(e) => void upload(e)} />
          </label>
          {branding?.logo_id && <Button variant="ghost" onClick={() => void removeLogo()}>Remove logo</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>What your documents say about you: covers, footers and any {"{{org.*}}"} in a template.</CardDescription>
        </CardHeader>
        <CardContent>
          {form === null ? (
            <p className="text-body-sm text-space-gray">Loading…</p>
          ) : (
            <form onSubmit={save} noValidate aria-label="Organisation details" className="grid max-w-panel gap-4 md:grid-cols-2">
              <TextField label="Name" className="md:col-span-2" autoComplete="organization" value={form.name}
                         onChange={edit("name")} error={fields.name} required />
              <TextField label="ABN" inputMode="numeric" hint="11 digits, e.g. 51 824 753 556." value={form.abn}
                         onChange={edit("abn")} error={fields.abn} />
              <TextField label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={edit("phone")}
                         error={fields.phone} />
              <TextField label="Email" type="email" autoComplete="email" className="md:col-span-2" value={form.email}
                         onChange={edit("email")} error={fields.email} />
              <TextAreaField label="Address" rows={3} autoComplete="street-address" className="md:col-span-2"
                             value={form.address} onChange={edit("address")} error={fields.address} />
              <div className="md:col-span-2">
                <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

In `apps/desktop/src/pages/Settings.tsx`, add the tab:
```tsx
const TABS = [
  { to: "/settings/users", label: "Users" },
  { to: "/settings/org", label: "Organisation" },
];
```

In `apps/desktop/src/App.tsx`, import the page and add its route after `users`:
```tsx
import { OrgSettings } from "./pages/OrgSettings";
```
```tsx
              <Route path="org" element={<OrgSettings />} />
```

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test`
Expected: `59 passed`.

**Step 5: Commit**

```
git add apps/desktop/src/pages/OrgSettings.tsx apps/desktop/src/pages/Settings.tsx apps/desktop/src/App.tsx \
  apps/desktop/src/test/Org.test.tsx
git commit -m "Set the organisation's details and logo on the desktop, where first run ends" \
  -m "A logo over 512 KB or not PNG or JPEG is refused before it is sent; a new one shows at once beside Simple Docs." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 25: Your account: change your own password

**Files:**
- Create: `apps/desktop/src/pages/Account.tsx`
- Modify: `apps/desktop/src/App.tsx` (the route)
- Test: `apps/desktop/src/test/Account.test.tsx`

**Step 1: Write the failing test**

`apps/desktop/src/test/Account.test.tsx`:
```tsx
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { apiError, MEL, renderApp, stubApi } from "./harness";

async function change(current: string, next: string, again = next) {
  const form = await screen.findByRole("form", { name: "Change your password" });
  await userEvent.type(within(form).getByLabelText("Current password"), current);
  await userEvent.type(within(form).getByLabelText("New password"), next);
  await userEvent.type(within(form).getByLabelText("New password again"), again);
  await userEvent.click(within(form).getByRole("button", { name: "Change password" }));
  return form;
}

describe("your account", () => {
  it("says who you are", async () => {
    stubApi(undefined, { me: MEL });
    renderApp("/account");
    expect(await screen.findByRole("heading", { level: 1, name: "Your account" })).toBeInTheDocument();
    expect(screen.getByText("Signed in as mel, an editor.")).toBeInTheDocument();
  });

  it("changes your password with the current one", async () => {
    const { calls } = stubApi((method, url) => method === "POST" && url === "/api/v1/auth/password"
      ? new Response(null, { status: 204 }) : null, { me: MEL });
    renderApp("/account");
    await change("correct horse battery", "a brand new password");
    expect(await screen.findByRole("status")).toHaveTextContent("Password changed.");
    expect(calls.find((c) => c.url === "/api/v1/auth/password")?.body).toEqual({
      current_password: "correct horse battery", new_password: "a brand new password" });
  });

  it("shows a wrong current password beside its field", async () => {
    stubApi((_method, url) => url === "/api/v1/auth/password"
      ? apiError(422, "invalid", "That isn't your current password.",
                 { current_password: "That isn't your current password." }) : null, { me: MEL });
    renderApp("/account");
    const form = await change("nope", "a brand new password");
    expect(await within(form).findByText("That isn't your current password.")).toBeInTheDocument();
    expect(within(form).getByLabelText("Current password")).toHaveAttribute("aria-invalid", "true");
  });

  it("checks the new passwords match before sending anything", async () => {
    const { calls } = stubApi(undefined, { me: MEL });
    renderApp("/account");
    await change("correct horse battery", "a brand new password", "a different one entirely");
    expect(await screen.findByText("The new passwords don't match.")).toBeInTheDocument();
    expect(calls.some((c) => c.url === "/api/v1/auth/password")).toBe(false);
  });
});
```

**Step 2: Run it to see it fail**

Run: `cd apps/desktop && npx vitest run src/test/Account.test.tsx`
Expected: FAIL, `Unable to find role="heading" and name "Your account"` (`/account` lands on Documents).

**Step 3: Write the implementation**

`apps/desktop/src/pages/Account.tsx`:
```tsx
import { useState, type FormEvent } from "react";
import { api, ApiError, messageOf } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/Card";
import { TextField } from "../ui/Field";
import { ROLE_NAMES } from "../ui/Layout";
import { Notice } from "../ui/Notice";
import { SectionHeading } from "../ui/SectionHeading";

const BLANK = { current_password: "", new_password: "", again: "" };

export function Account() {
  const { me } = useAuth();
  const [form, setForm] = useState(BLANK);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setDone(null);
    setProblem(null);
    if (form.new_password !== form.again) {
      setFields({ again: "The new passwords don't match." });
      return;
    }
    setFields({});
    setBusy(true);
    try {
      await api.post("/v1/auth/password", { current_password: form.current_password, new_password: form.new_password });
      setForm(BLANK);
      setDone("Password changed. You're still signed in here; anywhere else, sign in again.");
    } catch (err) {
      if (err instanceof ApiError && Object.keys(err.fields).length > 0) setFields(err.fields);
      else setProblem(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  const role = me ? ROLE_NAMES[me.role].toLowerCase() : "";
  const article = /^[aeiou]/.test(role) ? "an" : "a";

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading accentText="Your" description={me ? `Signed in as ${me.username}, ${article} ${role}.` : undefined}>
        account
      </SectionHeading>
      {problem && <Notice>{problem}</Notice>}
      {done && <Notice tone="success">{done}</Notice>}
      <Card className="max-w-panel">
        <CardHeader>
          <CardTitle>Change your password</CardTitle>
          <CardDescription>Your other sessions end; this one carries on.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} noValidate aria-label="Change your password" className="flex flex-col gap-4">
            <TextField label="Current password" type="password" autoComplete="current-password"
                       value={form.current_password} onChange={(e) => setForm({ ...form, current_password: e.target.value })}
                       error={fields.current_password} />
            <TextField label="New password" type="password" autoComplete="new-password" hint="At least 12 characters."
                       value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })}
                       error={fields.new_password} />
            <TextField label="New password again" type="password" autoComplete="new-password" value={form.again}
                       onChange={(e) => setForm({ ...form, again: e.target.value })} error={fields.again} />
            <div>
              <Button type="submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

In `apps/desktop/src/App.tsx`, import the page and add its route inside `Layout`, after `/clients`:
```tsx
import { Account } from "./pages/Account";
```
```tsx
          <Route path="/account" element={<Account />} />
```

**Step 4: Run it to see it pass**

Run: `cd apps/desktop && npm test && npm run lint && npm run build`
Expected: `63 passed`, no lint problems, and a build.

**Step 5: Commit**

```
git add apps/desktop/src/pages/Account.tsx apps/desktop/src/App.tsx apps/desktop/src/test/Account.test.tsx
git commit -m "Let anyone change their own password from their account page" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 26: Serve the desktop through Caddy at `http://localhost:8080`, and CI

**Files:**
- Create: `deploy/Caddyfile`
- Modify: `docker-compose.yml` (add `caddy` and its volumes)
- Create: `.github/workflows/ci.yml`

**Step 1: Write the files**

`deploy/Caddyfile`:
```
{
	# Simple Docs runs on this machine, over plain http (the design): no
	# certificates to fetch and no redirect to https.
	auto_https off
}

:80 {
	encode gzip
	header {
		X-Content-Type-Options nosniff
		Referrer-Policy same-origin
		X-Frame-Options DENY
		-Server
	}

	# The API is the only door: /api/v1/... reaches it as /v1/... Bodies are
	# JSON or, at most, a 512 KB logo; Caddy refuses anything silly first.
	handle_path /api/* {
		request_body {
			max_size 16MB
		}
		reverse_proxy api:8000
	}

	# The desktop: everything else. Any route is the app's page, asked for
	# afresh each time; the built files have hashed names and keep.
	handle {
		header Content-Security-Policy "default-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		@page not path /assets/* /favicon.svg
		header @page Cache-Control "no-cache"
		root * /srv/desktop
		try_files {path} /index.html
		file_server
	}
}
```

In `docker-compose.yml`, replace the worker comment and the `volumes:` block at the end with:
```yaml
  # worker: arrives with step 3, when there is a job queue to drain
  # (generation, exports, repo analysis, monkiro sync, pull requests). Same
  # image and DOCS_ settings as api, command `python -m sdocs.worker`, and
  # DOCS_REPO_ROOT mounted read-only like api from step 4.

  caddy:
    image: caddy:2
    restart: unless-stopped
    # This machine only, over plain http (the design): http://localhost:8080,
    # or DOCS_HTTP_PORT when something else has 8080.
    ports:
      - "127.0.0.1:${DOCS_HTTP_PORT:-8080}:80"
    volumes:
      # the folder, not the file: an edited Caddyfile is a new file, and a
      # file mount would keep showing Caddy the old one
      - ./deploy:/etc/caddy:ro
      # the desktop, built on the host: cd apps/desktop && npm ci && npm run build
      - ./apps/desktop/dist:/srv/desktop:ro
      - caddy_data:/data
      - caddy_config:/config
    # the API runs its migrations first: wait until it answers
    depends_on:
      api:
        condition: service_healthy

volumes:
  pgdata:
  caddy_data:
  caddy_config:
```

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

# One run per branch: a new push cancels the one before it.
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  api:
    name: API
    runs-on: ubuntu-latest
    services:
      db:
        image: postgres:16
        env:
          POSTGRES_DB: sdocs
          POSTGRES_USER: sdocs
          POSTGRES_PASSWORD: sdocs
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U sdocs"
          --health-interval 5s
          --health-timeout 3s
          --health-retries 20
    env:
      # the suite makes and drops its own databases on this server
      TEST_DATABASE_URL: postgresql+psycopg://sdocs:sdocs@127.0.0.1:5432/sdocs_test
    defaults:
      run:
        working-directory: api
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true
      - name: Install
        run: uv venv -p 3.12 && uv pip install -e ".[dev]"
      - name: Lint
        run: .venv/bin/ruff check .
      - name: Types
        run: .venv/bin/mypy
      - name: Tests
        run: .venv/bin/pytest -q

  desktop:
    name: Desktop app
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/desktop
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/desktop/package-lock.json
      - run: npm ci
      - name: Lint
        run: npm run lint
      - name: Tests
        run: npm test
      - name: Types and build
        run: npm run build

  compose:
    name: Docker Compose comes up
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: apps/desktop/package-lock.json
      - name: Build the desktop for Caddy
        working-directory: apps/desktop
        run: npm ci && npm run build
      - name: Settings a real install needs
        run: |
          cp .env.example .env
          sed -i 's/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=ci-only-password/' .env
      - name: Up
        run: docker compose up -d --build
      - name: The app answers through Caddy, and the migrations ran
        run: |
          for i in $(seq 1 30); do
            if curl -fsS http://127.0.0.1:8080/api/v1/health 2>/dev/null; then ok=1; break; fi
            sleep 2
          done
          test "${ok:-0}" = 1 || (docker compose logs; exit 1)
          # a fresh install asks for its first admin
          curl -fsS http://127.0.0.1:8080/api/v1/branding | grep -q '"setup_needed":true'
          # the desktop is served, and any route is the app's page
          curl -fsS http://127.0.0.1:8080/ | grep -q 'id="root"'
          curl -fsS http://127.0.0.1:8080/settings/users | grep -q 'id="root"'
          # a change without X-Simple-Docs is refused
          test "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
            -d '{}' http://127.0.0.1:8080/api/v1/setup)" = 403
          # block_change(), which later steps' append-only tables use
          docker compose exec -T db psql -U sdocs -d sdocs -tAc \
            "select count(*) from pg_proc where proname = 'block_change'" | grep -qx 1
          # and app_user's guard: people are deactivated, never deleted
          docker compose exec -T db psql -U sdocs -d sdocs -tAc \
            "select count(*) from pg_trigger where tgname = 'app_user_never_deleted'" | grep -qx 1
      - name: Down
        if: always()
        run: docker compose down -v
```

**Step 2: Build the desktop and bring everything up**

```
cd apps/desktop && npm run build && cd ../..
docker compose up -d --build
```

**Step 3: Check it (your `.env` has `DOCS_HTTP_PORT=8380`)**

Run: `curl -fsS http://127.0.0.1:8380/api/v1/health`
Expected: `{"status":"ok"}`

Run: `curl -fsS http://127.0.0.1:8380/settings/users | grep -c 'id="root"'`
Expected: `1`

Run: `curl -sI http://127.0.0.1:8380/ | grep -i -E 'content-security-policy|cache-control'`
Expected: the CSP above and `Cache-Control: no-cache`.

Run: `curl -s -o /dev/null -w '%{http_code}\n' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:8380/api/v1/setup`
Expected: `403`

Open `http://localhost:8380`: the first-run page on the star field.

**Step 4: Commit**

```
git add deploy/Caddyfile docker-compose.yml .github/workflows/ci.yml
git commit -m "Serve the desktop and the API through Caddy on localhost, and run CI" \
  -m "CI runs the API's tests, lint and types against Postgres, the desktop's lint, tests and build, and a Compose start that checks block_change() is there." \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 27: The README, and CLAUDE.md's layout

**Files:**
- Create: `README.md`
- Modify: `CLAUDE.md` (the repo layout and a few conventions)

**Step 1: Write the README**

`README.md`:
````markdown
# Simple Docs

Point it at the work. Get the document.

Simple Docs is an open source, self-hosted documentation generator by
[Q7 Technology](https://q7technology.com.au). Start from a template, a form,
notes or a code repository; Simple Docs drafts the document section by
section through OpenRouter, strips secrets before anything leaves the
machine, puts client documents through review, and exports Markdown, a
branded PDF, a Word file or a GitHub pull request. It runs on your own
machine with Docker Compose.

## Where it's up to

It is being built in eight steps (`docs/plans/2026-10-19-simple-docs-design.md`).
Step 1 is done: you can set it up, sign in, look after users and roles, and
give it your organisation's details and logo. Each screen that isn't built
yet says which step brings it.

| Step | What it brings |
|---|---|
| 1 | Sign in, first run, users and roles, organisation details and logo |
| 2 | Clients and projects, templates, documents and their versions, Markdown export |
| 3 | Writing with AI through OpenRouter, with a budget and the redactor |
| 4 | Code repositories as sources |
| 5 | Review, and PDF and Word exports |
| 6 | Images, diagrams and tables |
| 7 | The template editor |
| 8 | GitHub pull requests and the monkiro connector |

## Getting started

You need Docker and Node 22.

```
git clone https://github.com/q7-technology/simple-docs.git
cd simple-docs
cp .env.example .env          # then set POSTGRES_PASSWORD
(cd apps/desktop && npm ci && npm run build)
docker compose up -d --build
```

Open <http://localhost:8080>. If something else on your machine has port
8080, set `DOCS_HTTP_PORT` in `.env` (say `8380`) and run
`docker compose up -d` again.

The first page asks for your organisation's name and makes you its first
admin. It ends on Settings → Organisation, where the ABN, contact details
and logo go.

## Who may do what

| Role | May |
|---|---|
| Reviewer | Read documents and clients, and approve or send back what is in review (step 5) |
| Editor | Write documents, and look after clients and projects |
| Admin | Everything: users and roles, Settings, templates and spend |

People are deactivated, never deleted, so documents keep their authors.
Nobody deactivates themselves, and there is always one active admin.

Five wrong passwords lock the password for 15 minutes. An admin can set a
new one in Settings → Users, which also clears the lock.

## If nobody can sign in as an admin

```
docker compose exec api sdocs set-password --username <your username>
```

It asks for the new password twice, clears any lock and ends that person's
sessions. `sdocs create-user` adds someone (an admin unless `--role` says
otherwise).

## The API from a script

The desktop is an ordinary client of the API, so anything it does, a script
can do. Sign in with a cookie jar, and send `X-Simple-Docs: 1` with anything
that changes something:

```
curl -c jar -H 'X-Simple-Docs: 1' -H 'Content-Type: application/json' \
  -d '{"username": "you", "password": "your password"}' \
  http://localhost:8080/api/v1/auth/sign-in
curl -b jar http://localhost:8080/api/v1/users
```

Every error is `{"error": {"code", "message", "fields"?}}`: `code` for your
program, `message` for a person. The endpoints are listed at
<http://127.0.0.1:8044/docs> (the API's own port, on this machine only).

## Run the API and the desktop outside Docker

```
docker compose up -d db && docker compose stop api
cd api && uv venv -p 3.12 && uv pip install -e ".[dev]"
export DOCS_DATABASE_URL=postgresql+psycopg://sdocs:<POSTGRES_PASSWORD>@127.0.0.1:5436/sdocs
.venv/bin/alembic upgrade head
.venv/bin/uvicorn sdocs.api.app:app --port 8044 --reload
```

```
cd apps/desktop && npm ci && npm run dev    # http://localhost:5178, /api goes to 127.0.0.1:8044
```

## Tests

```
cd api && .venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/mypy
cd apps/desktop && npm test && npm run lint && npm run build
```

The API's tests run against the Compose database on 127.0.0.1:5436 and make
their own `sdocs_test` database. They expect `POSTGRES_PASSWORD=sdocs-dev`
unless `TEST_DATABASE_URL` says otherwise.

## Ports on one machine

Simple Docs sits beside Simple WMS, Simple TMS and Simple LMS: database
5436, API 8044 (both on 127.0.0.1), the app on 8080 (or `DOCS_HTTP_PORT`),
and the desktop's dev server on 5178.

## Stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic and PostgreSQL 16;
Vite, React, TypeScript and Tailwind for the desktop, in the Q7 design
system's dark theme; Docker Compose and Caddy. Passwords are argon2id
hashes; the session is an httpOnly, SameSite=Strict cookie.

## Licence

MIT. See `LICENSE`.
````

**Step 2: Bring CLAUDE.md's layout up to date**

In `CLAUDE.md`, replace the block under `## Repo layout`:
````markdown
```
CLAUDE.md            this file
docs/plans/          design and implementation plans
api/                 FastAPI app, alembic, tests
apps/desktop/        the web app
templates/           starter templates (YAML)
export/              print.css, reference.docx, cover artwork
docker-compose.yml
```
````
with:
````markdown
```
CLAUDE.md            this file
docs/plans/          design and implementation plans
api/                 FastAPI app (package and command sdocs), alembic, tests
apps/desktop/        the web app (Vite, React, Tailwind from the Q7 tokens)
deploy/Caddyfile     the way in: the app at /, the API at /api
.github/workflows/   CI: API tests, lint and types; the app's lint, tests and build; Compose
templates/           starter templates (YAML), from step 2
export/              print.css, reference.docx, cover artwork, from step 5
docker-compose.yml   db, api, caddy (the worker comes with step 3)
```

## Conventions
- Every API error is `{"error": {"code", "message", "fields"?}}`; messages are
  written for people.
- The session is an httpOnly, SameSite=Strict cookie (`sdocs_session`); a
  request that changes something carries `X-Simple-Docs: 1`.
- Ports: database 5436, API 8044, the app 8080 (`DOCS_HTTP_PORT`, 8380 on
  Q7's Mac), Vite 5178.
- `pytest`, `ruff` and `mypy` run from `api/`; `npm test`, `npm run lint` and
  `npm run build` from `apps/desktop/`.
- Australian English and sentence case in copy.
````

**Step 3: Commit**

```
git add README.md CLAUDE.md
git commit -m "Write the README and bring CLAUDE.md's layout up to date" \
  -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 28: Every suite, and a clean Compose start

**Step 1: The API**

Run: `cd api && .venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/mypy`
Expected: `93 passed`, `All checks passed!`, `Success: no issues found`.

**Step 2: The desktop**

Run: `cd apps/desktop && npm test && npm run lint && npm run build`
Expected: `63 passed`, no lint problems, a build in `dist/`.

**Step 3: From nothing**

```
docker compose down -v
docker compose up -d --build
```

Run: `curl -fsS http://127.0.0.1:8380/api/v1/branding`
Expected: `{"setup_needed":true,"org_name":null,"logo_id":null}`

Run: `docker compose exec -T db psql -U sdocs -d sdocs -tAc "select tgname from pg_trigger where not tgisinternal"`
Expected: `app_user_never_deleted`

Run: `docker compose ps --format '{{.Service}} {{.State}}'`
Expected: `api running`, `caddy running`, `db running`.

**Step 4: Nothing left over**

Run: `git status --short`
Expected: nothing. If a step above needed a fix, it was made test first and committed with its own message.

---

### Task 29: Walk through it by hand, from an empty install to three people signed in

Use `http://localhost:8380` after Task 28's clean start. Use the keyboard for at least steps 1 and 4.

**Step 1: First run.** The page shows the Simple Docs mark on the star field. Tab through it: every control shows the focus ring. Mismatched passwords say so beside the second one. Set up "Q7 Technology" with yourself as the admin. It lands on Settings → Organisation, signed in.

**Step 2: The organisation.** Type the ABN without spaces (it comes back as `xx xxx xxx xxx`); try one wrong digit (refused beside the field). Add the phone, email and a two-line address; save. Upload `/Users/leightonlauton/Q7 Technology/Software/q7/design-system/assets/Logos/q7-logo-128.png`: the navbar shows it at once. Try an SVG or a file over 512 KB: refused, said in words.

**Step 3: The shell.** Documents, Clients, Templates and Spend each say which step brings them. Press Tab once on a fresh page: "Skip to main content" appears top left, and Enter moves focus past the navbar.

**Step 4: Users.** Add an editor and a reviewer. There is no Deactivate beside your own name. Make yourself an editor: "Simple Docs needs at least one active admin…". 

**Step 5: The others.** In a private window, sign in as the editor: Documents and Clients only, no Settings; typing `/settings/users` lands on Documents. Sign out. Sign in as the reviewer with a wrong password five times: the fifth says it is locked for 15 minutes. As the admin, set the reviewer's password: Users shows them unlocked, and they sign in with it.

**Step 6: The cookie.** In the browser's developer tools, `sdocs_session` is HttpOnly and SameSite Strict, and `document.cookie` in the console doesn't show it.

**Step 7: Your account.** Change your own password from your name in the navbar; the private window's session (if it is yours) is signed out; this one isn't.

**Step 8: Less motion.** Turn on System Settings → Accessibility → Display → Reduce motion and reload: hover colours change at once; nothing on the page moves.

**Step 9: The way back in.** `docker compose exec api sdocs set-password --username <you>` sets a new password, and the old session is signed out.

**Step 10: Deactivate the reviewer.** Their open session stops at the next click; the row stays in Users as Deactivated, and Reactivate brings them back.

Anything that doesn't behave as written here is a bug: write the failing test first, fix it, commit it.
