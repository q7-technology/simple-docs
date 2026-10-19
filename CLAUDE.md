# Simple Docs — instructions for Claude Code

Read `docs/plans/2026-10-19-simple-docs-design.md` before touching anything. It
is the design, and the decisions in it are settled unless a human changes them
there first.

## What this is
An open source, self-hosted documentation generator by Q7 Technology. Start
from a template, a form, notes, or a code repo; Simple Docs drafts the document
section by section through OpenRouter, strips secrets before anything leaves
the machine, puts client documents through review, and exports Markdown, a
branded PDF, a Word file or a GitHub pull request. Desktop web app, one Python
API, one worker, one PostgreSQL database. It sits beside Simple WMS, Simple
TMS, Simple LMS and Platen and works without any of them.

## Four rules that never bend
1. **Versions are append-only.** Never UPDATE or DELETE a `document_version`
   row. A change is a new row; restore copies an old one into a new row.
   Documents are archived and people deactivated, never deleted.
2. **Nothing leaves the machine unfiltered.** Every prompt to OpenRouter goes
   through the ignore list and the redactor, and only to zero-retention
   providers. Never add a bypass flag.
3. **Money is checked before the call.** No OpenRouter request is sent unless
   its estimate fits the per-run cap and the remaining monthly budget.
4. **The API is the only door.** The desktop app is an ordinary API client with
   a session token. If the UI can do it, a script can too.

## Stack (decided)
- API: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic.
- Database: PostgreSQL 16.
- Queue: a Postgres `job` table drained by a Python worker with backoff
  (1 min, 5, 30). No Redis or RabbitMQ.
- Front end: Vite + React + TypeScript + Tailwind in `apps/desktop`, TipTap
  editor, Mermaid. Styled with the Q7 design system (one dark theme).
- Export: WeasyPrint for PDF, Pandoc + python-docx for Word.
- AI: OpenRouter only, `provider: { data_collection: "deny", zdr: true }`.
- Hosting: Docker Compose: `api`, `worker`, `db`, `caddy`. Secrets in `.env`.
  `DOCS_REPO_ROOT` is mounted read-only.

## Repo layout
```
CLAUDE.md            this file
docs/plans/          design and implementation plans
api/                 FastAPI app (package and command sdocs), alembic, tests, uv.lock
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
- Roles and scopes live in `api/sdocs/services/sessions.py` (`SCOPES`): admin
  `*`; editor documents, clients and `reviews:write`; reviewer reads and
  `reviews:write` only. Nobody approves their own version.
- Ports: database 5436, API 8044 (both 127.0.0.1), the app 8080
  (`DOCS_HTTP_PORT`, 8380 on Q7's Mac), Vite 5178.
- The command line never takes a password as an argument: `sdocs create-user`
  and `sdocs set-password` prompt, or read one line with `--password-stdin`.
- The API's image runs as `sdocs` (uid 10001) and installs what `api/uv.lock`
  pins; add a dependency with `uv add` and commit the lock. CI installs with
  `uv sync --locked --extra dev -p 3.12`.
- `pytest`, `ruff` and `mypy` run from `api/` (the tests need the Compose `db`
  and `POSTGRES_PASSWORD=sdocs-dev`, or `TEST_DATABASE_URL` ending in `_test`);
  `npm test`, `npm run lint` and `npm run build` from `apps/desktop/`.
- Australian English and sentence case in copy.

## Testing
Tests never call the real OpenRouter; use the fake server. `make smoke` is the
only live call and is never run in CI.
