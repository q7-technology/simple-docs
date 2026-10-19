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

It is being built in eight steps, set out in the design,
[`docs/plans/2026-10-19-simple-docs-design.md`](docs/plans/2026-10-19-simple-docs-design.md).
Step 1 is done: you can set it up, sign in, look after users and roles, and
give it your organisation's details and logo. It doesn't write documents
yet. Each screen that isn't built yet says which step brings it.

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

Use only letters, digits and `- . _ ~` in `POSTGRES_PASSWORD`. It goes into
the API's database address as it is, so anything else would have to be
URL-encoded.

Open <http://localhost:8080>. If something else on your machine has port
8080, set `DOCS_HTTP_PORT` in `.env` (say `8380`) and run
`docker compose up -d` again.

The first page asks for your organisation's name and makes you its first
admin. It ends on Settings → Organisation, where the ABN, contact details
and logo go.

Until that first page is filled in, whoever reaches it first becomes the
admin. Finish the first run before anyone else can reach the address.

## Who may do what

| Role | May |
|---|---|
| Reviewer | Read documents and clients, and approve someone else's version or ask for changes (step 5). Reviewers can't edit. |
| Editor | Write documents, look after clients and projects, and approve someone else's version |
| Admin | Everything: users and roles, Settings, templates and spend |

Nobody approves their own version.

People are deactivated, never deleted, so documents keep their authors.
Nobody deactivates themselves, and there is always one active admin.

Five wrong passwords lock the password for 15 minutes. An admin can set a
new one in Settings → Users, which also clears the lock.

## If nobody can sign in as an admin

```
docker compose exec api sdocs set-password --username <your username>
```

It asks for the new password twice, clears any lock and ends that person's
sessions. A password is never an argument, where it would sit in your shell
history. From a script, pipe it in on one line instead:

```
printf '%s\n' "$PW" | docker compose exec -T api sdocs set-password --username <you> --password-stdin
```

`sdocs create-user --username <them> --name "<their name>"` adds someone
(an admin unless `--role editor` or `--role reviewer` says otherwise), and
takes `--password-stdin` the same way. `docker compose exec -T api sdocs --help`
lists both.

## The API from a script

The desktop is an ordinary client of the API, so anything it does, a script
can do. Sign in with a cookie jar, and send `X-Simple-Docs: 1` with anything
that changes something (without it the API answers 403):

```
curl -c jar -H 'X-Simple-Docs: 1' -H 'Content-Type: application/json' \
  -d '{"username": "you", "password": "your password"}' \
  http://localhost:8080/api/v1/auth/sign-in
curl -b jar http://localhost:8080/api/v1/users      # as an admin
```

Every error is `{"error": {"code", "message", "fields"?}}`: `code` for your
program, `message` for a person. The API also answers on its own port, on
this machine only: <http://127.0.0.1:8044/v1/health>, and the endpoints are
listed at <http://127.0.0.1:8044/docs>.

## Keeping it to this machine

Compose publishes everything on 127.0.0.1 only, over plain http. That suits
one person on their own machine. Two things to know before going further:

- Browsers send localhost's cookies to every port on localhost, so any other
  app you run on this machine sees the Simple Docs session cookie.
- The session cookie is only marked Secure when `DOCS_COOKIE_SECURE=true`.

For anything beyond one person on one machine, serve Simple Docs on its own
hostname over https and set `DOCS_COOKIE_SECURE=true`. Step 1 doesn't do that
for you: it means changing Caddy's port and `deploy/Caddyfile` (which has
`auto_https off`) yourself.

## Run the API and the desktop outside Docker

The API container publishes 8044, so stop it first if the whole stack is up.

```
docker compose up -d db && docker compose stop api
cd api && uv sync --locked --extra dev -p 3.12
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
unless `TEST_DATABASE_URL` says otherwise (its database name must end in
`_test`, because the tests wipe it).

CI (`.github/workflows/ci.yml`) runs the same checks, installs the API with
`uv sync --locked --extra dev -p 3.12`, and brings the whole Compose stack up.

## Ports on one machine

Simple Docs sits beside Simple WMS, Simple TMS and Simple LMS: database
5436, API 8044 (both on 127.0.0.1), the app on 8080 (or `DOCS_HTTP_PORT`),
and the desktop's dev server on 5178.

## Stack

Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic and PostgreSQL 16;
Vite, React, TypeScript and Tailwind for the desktop, in the Q7 design
system's dark theme; Docker Compose and Caddy. The API's image runs as a
non-root user (`sdocs`, uid 10001) and installs exactly what `api/uv.lock`
pins. Passwords are argon2id hashes; the session is an httpOnly,
SameSite=Strict cookie.

## Licence

MIT, © Q7 Technology. See [`LICENSE`](LICENSE).
