# Simple Docs — design

Date: 2026-10-19 · Status: approved · Licence: MIT

## What this is

An open source, self-hosted documentation generator by Q7 Technology. A team
starts from a template, a form, free-text notes, or a code repository, and
Simple Docs drafts the document section by section through OpenRouter, strips
secrets before anything leaves the machine, puts client-facing documents
through review, and exports Markdown, a branded PDF, a Word file, or a GitHub
pull request.

It sits beside Simple WMS, Simple TMS, Simple LMS and Platen and shares their
shape. Q7 runs it on a Mac with Docker Compose; anyone else can run it the same
way on a server.

Four kinds of document:

- **Client**: proposal, statement of work, handover, end-user guide, SOP.
- **IT support**: site and network documentation, runbooks, onboarding and
  offboarding, asset registers, backup and DR plans, incident reports.
- **Product spec**: brief, flows, screens, data model, architecture, build
  plan, setup, design doc.
- **Code**: README, API reference, CLAUDE.md, CHANGELOG, setup and deploy.

## Four rules that never bend

1. **Versions are append-only.** A change to a document is a new
   `document_version` row, never an UPDATE. Restore copies an old version into
   a new row.
2. **Nothing leaves the machine unfiltered.** Every outbound prompt passes the
   ignore list and the redactor. There is no bypass flag.
3. **Money is checked before the call.** No OpenRouter request is sent unless
   its estimate fits the per-run cap and what is left of the monthly budget.
4. **The API is the only door.** The desktop app is an ordinary API client with
   a session token. If the UI can do it, a script can too.

## Decisions

| Topic | Decision |
|---|---|
| Users | Multiple local accounts, username + password, roles `admin`, `editor`, `reviewer`. No SSO. |
| Hosting | Docker Compose on the user's Mac (or any server). Local only. |
| AI | OpenRouter. Default model per doc type set by an admin, override per run. Zero-retention providers only. |
| Inputs | Template, form, free-text notes, repo (GitHub, local path under a mounted root, zip/folder upload). Mixable. |
| Editing | Rich editor (TipTap) with per-section AI tools, streamed generation. |
| Outputs | Markdown, branded PDF (light print style, dark cover), Word, GitHub PR. |
| History | Full: every document, input and version is kept. |
| Review | Draft → In review → Approved for templates that require it (the client set). Nobody approves their own version. |
| Spend | Monthly budget (warn at 80%, block at 100%) and a per-run cap. |
| Visuals | Uploaded images, AI-written Mermaid diagrams, tables from data. |
| Client data | Built-in Clients & Projects, optional monkiro connector (API key in settings). |
| Templates | Admins edit in-app; starters ship as YAML in the repo. |
| Write-back | GitHub pull request only. Never to `main`, never auto-merged. |

## 1. Architecture

### Stack

- API: Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2, Alembic.
- Database: PostgreSQL 16.
- Queue: a Postgres `job` table drained by a Python worker with backoff
  (1 min, 5, 30). No Redis.
- Front end: Vite + React + TypeScript + Tailwind, `apps/desktop`. TipTap
  editor, Mermaid rendered in the browser.
- Export: WeasyPrint (PDF), Pandoc + python-docx (Word).
- Hosting: Docker Compose: `api`, `worker`, `db`, `caddy`. Secrets in `.env`.

### Repo layout

```
CLAUDE.md                 rules + stack, read first
docs/plans/…-design.md    this design
api/                      FastAPI app (docs/ package, alembic, tests)
apps/desktop/             Vite + React + TS + Tailwind, Q7 dark theme
templates/                starter templates as YAML (seeded into the DB)
export/                   print.css, reference.docx, cover artwork
docker-compose.yml        api · worker · db · caddy
```

### Services

| Service | Job |
|---|---|
| `db` | PostgreSQL 16. All records, versions and uploaded images (`bytea` in v1, so one `pg_dump` is a full backup). |
| `api` | FastAPI. Auth, CRUD, starting jobs, streaming generation over SSE, OpenRouter and GitHub calls. |
| `worker` | Drains `job`: repo clone and analysis, long generations, PDF/Word export, monkiro sync, opening PRs. |
| `caddy` | Serves the built desktop app at `http://localhost:8080` and proxies `/api`. |

### Local folders and secrets

- `.env` sets `DOCS_REPO_ROOT` (e.g. `~/Q7 Technology/Software`), mounted
  **read-only** into `api` and `worker`. The app can only see under it.
- `.env` holds `OPENROUTER_API_KEY`, `GITHUB_TOKEN` (private repos and PRs)
  and optionally `MONKIRO_API_KEY`. None of them ever reaches the browser.

### Look

The desktop app uses the Q7 design system (`design-system/` in the Q7
workspace): `tokens.json` becomes the Tailwind theme; `Card`, `Button`, `Chip`,
`Badge`, `Input`, `Textarea`, `SectionHeading` and `SimulatedNotice` are reused;
lucide icons at 1.5px. One dark theme. Panels are cards on the star field.
Primary buttons are `space-blue` with `space-darkBlue` text (the AA-safe
pairing). Gold marks DRAFT, warnings and test runs. Animations collapse under
`prefers-reduced-motion`.

## 2. Data model

Every table has `id uuid`, `created_at`, `created_by`. People are deactivated,
never deleted; documents are archived, never deleted.

### People and settings

- `app_user`: `username` (unique), `password_hash` (argon2id),
  `display_name`, `role` (`admin` | `editor` | `reviewer`), `active`. First run
  creates the first admin.
- `session`: opaque token in an httpOnly, SameSite=Strict cookie, 12 h sliding
  expiry.
- `setting`: key/value JSON. Default model per category, monthly budget,
  per-run cap, extra ignore patterns, extra redaction patterns, IT redaction
  toggles, monkiro enabled, store prompts (off), org details (`org.name`,
  `org.abn`, `org.phone`, `org.email`, `org.address`, `org.logo`).

### Clients

- `client`: `name`, `abn`, `address`, `contacts` (JSON), `notes`, `source`
  (`local` | `monkiro`), `external_id`, `synced_at`. Synced rows are read-only
  except `notes`.
- `project`: `client_id`, `name`, `status`, `external_id`.

### Templates

- `template`: `key`, `name`, `category` (`client` | `it_support` |
  `product_spec` | `code`), `description`, `requires_approval`, `export_style`
  (`branded` | `plain`), `default_path` (for PRs), `active`,
  `current_version_id`.
- `template_version`: frozen once published. `fields` (JSON form schema),
  `sections` (ordered list, see §5), `system_prompt`, `defaults`, `status`
  (`draft` | `published`).

### Documents

- `document`: `title`, `template_version_id`, `client_id`, `project_id`,
  `status` (`draft` | `in_review` | `approved` | `archived`),
  `current_version_id`, `locked_by`, `lock_expires_at`.
- `document_version` (append-only): `document_id`, `number`, `content`
  (TipTap JSON), `form_values`, `source_ids`, `reason` (`generated` | `edited`
  | `section_regenerated` | `restored` | `merged`), `author_id`. Autosave
  squashes a user's draft edits into one version per 2 minutes.
- `review`: `document_version_id`, `reviewer_id`, `decision` (`approved` |
  `changes_requested`), `comment`. Reviewer ≠ version author. Any edit after
  approval returns the document to `draft`.
- `source`: `kind` (`github` | `local_path` | `upload` | `notes`), `ref`
  (URL + branch + commit SHA, path, upload id, or text), `analysis` (JSON:
  tree, facts, selected files), `redaction_report` (rule, file, line; never the
  value).
- `file_summary`: `content_hash`, `model`, `summary`. Cache for large repos.
- `asset`: `document_id`, `kind` (`image` | `diagram`), `mime`, `bytes`,
  `caption`.

### AI, jobs, outputs

- `ai_run`: `document_id`, `section_key`, `purpose` (`outline` | `section` |
  `tool` | `summary` | `merge` | `test`), `model`, `provider`,
  `prompt_tokens`, `completion_tokens`, `cost_usd`, `estimate_usd`, `status`,
  `duration_ms`, `redactions`, `prompt` (only if the setting is on).
- `job`: `kind` (`analyse_repo` | `generate` | `export` | `sync_monkiro` |
  `open_pr`), `payload`, `status`, `attempts`, `next_run_at`, `error`.
- `export`: `document_version_id`, `format` (`md` | `pdf` | `docx` | `zip`),
  `file`, `watermarked`.
- `pull_request`: `document_ids`, `repo`, `base_sha`, `branch`, `url`,
  `state`.

## 3. Generating a document

### Wizard

1. **Template**: grid filtered by category chips.
2. **Details**: the template's form; client/project picker fills org and
   contact fields.
3. **Sources** (optional, mixable): GitHub URL + branch, local folder under the
   root, zip/folder upload, notes or transcript, images.
4. **Review & run**: model (default preselected), cost estimate range, budget
   left this month, redaction summary, "Let me check the outline first"
   option. Button: **Generate document**.

### Pipeline (each step is a job)

1. **Gather**: fetch, analyse (§4), normalise notes, redact.
2. **Outline**: one cheap call returns a JSON plan: per section, key points and
   which sources to use. Optionally paused for the user to edit.
3. **Write sections**: one call per `ai`/`table`/`diagram` section with system
   prompt + template instructions + outline + that section's source excerpts +
   earlier sections (summarised when long). Up to 3 in parallel where
   `depends_on` allows. Streamed to the editor over SSE.
4. **Assemble**: `fixed` and `field` sections filled by code. Mermaid
   validated; one retry with the parse error, then fallback (§8). Saved as a
   `generated` version.

### Section tools

Regenerate · Shorter · Longer · More technical · Plainer · Custom instruction.
Each is one `ai_run` on that section and saves a `section_regenerated`
version.

### OpenRouter call

- `POST /api/v1/chat/completions`, `stream: true`,
  `usage: { include: true }` for real cost.
- `provider: { data_collection: "deny", zdr: true }`. Models with no
  zero-retention endpoint are hidden from the picker.
- Model list and prices from `/api/v1/models`, cached 24 h.

### Budget check

`estimate = prompt_tokens × input_price + max_tokens × output_price`. Refused
before sending if it exceeds the per-run cap or the remaining monthly budget,
with what to do next (cheaper model, fewer sources, ask an admin). Banner at
80% of budget.

### Voice

The default system prompt carries the Q7 voice: plain Australian English, a
number or a mechanism behind every claim, no hype words, sentence case.
Templates add their own rules.

## 4. Repo analysis and secret safety

### Fetching

| Source | How |
|---|---|
| GitHub | `git clone --depth 1 --branch <b>` into a worker temp dir with `GITHUB_TOKEN`; commit SHA recorded; temp dir removed after. |
| Local path | Read from the read-only mount after resolving symlinks and confirming the real path is under `DOCS_REPO_ROOT`. |
| Upload | Zip or folder ≤ 200 MB. Path traversal, symlinks and zip bombs (expansion ratio, total size, file count) rejected. Then treated like a clone. |

### Ignore list (in order)

1. **Always excluded** (not removable): `.env*` except `.env.example`,
   `*.pem`, `*.key`, `*.p12`, `*.pfx`, `id_rsa*`, `id_ed25519*`, `*.kdbx`,
   `credentials*.json`, `*.tfstate*`, `kubeconfig`, `.npmrc`, `.pypirc`,
   `secrets.*`.
2. The repo's `.gitignore`.
3. Default noise: `node_modules`, `dist`, `build`, `.venv`, `.git`,
   lockfiles, binaries and images, minified files, files > 256 KB.
4. Admin patterns from settings.

### Analysis

- **Deterministic facts**: file tree, languages and line counts, manifests
  (`package.json`, `pyproject.toml`, `Dockerfile`, `docker-compose.yml`), env
  var *names* from `.env.example`, existing `README`, `CLAUDE.md`, `docs/`, last
  50 commits, routes and models by pattern (FastAPI, Express/Hono,
  SQLAlchemy/Alembic) with a generic fallback.
- **Summaries**: when the repo will not fit, a cheap model summarises relevant
  files; cached in `file_summary` by content hash.
- **Selection**: per outlined section, rank files by path and keyword match to
  the template's `source_hints`; full text up to that section's token budget,
  summaries for the rest.

### Redactor

Runs on every outbound prompt: repo content, notes, form values, section-tool
text.

- Gitleaks rule set (AWS, GitHub, Stripe, Slack, OpenAI/OpenRouter keys, JWTs,
  private key blocks, credentialed connection strings), assignment heuristics
  (`password = "…"`, `secret: …`), admin patterns.
- High-entropy strings ≥ 20 characters.
- IT toggles (off by default): private IPs, MAC addresses.
- Replacement: `[REDACTED:<rule>]`. Count on `ai_run`; report (file, line,
  rule, never the value) shown at Review & run, with **View what's sent**.
- Output is scanned too: if a redacted value reappears, the run is flagged.

## 5. Templates

### Section kinds

| Kind | Filled by | Example |
|---|---|---|
| `ai` | Model, using `instructions`, `length` (`short` / `medium` / `long`), `source_hints`, optional `model` | Executive summary |
| `fixed` | Code: rich text with `{{field}}` and `{{org.*}}` placeholders | Terms, signature block |
| `field` | Code: renders a form field | Contacts, asset list |
| `table` | Model, as JSON against a declared column schema; validated, then rendered | API endpoints, IP plan |
| `diagram` | Model, Mermaid of a declared `diagram_type` | Architecture, network topology |

Any section can be `optional` (ticked in the wizard) and declare `depends_on`.

### Example

```yaml
key: project-handover
name: Project handover
category: client
requires_approval: true
export_style: branded
fields:
  - { key: client, type: client_picker, required: true }
  - { key: go_live, type: date, label: Go-live date }
  - { key: systems, type: repeatable, label: Systems handed over,
      fields: [{key: name, type: text}, {key: owner, type: text}] }
sections:
  - { key: summary, heading: Summary, kind: ai, length: short,
      instructions: "What was delivered, for whom, and what changes for them on Monday." }
  - { key: systems, heading: Systems, kind: field, field: systems }
  - { key: topology, heading: How it fits together, kind: diagram, diagram_type: flowchart }
  - { key: support, heading: Support, kind: fixed, body: "Call {{org.phone}} …" }
```

### Starter templates (25)

- **Client** (approval on): Proposal, Statement of Work, Project Handover,
  End-user Guide, SOP.
- **IT support**: Site & Network Documentation, Runbook, Onboarding Checklist,
  Offboarding Checklist, Asset Register, Backup & DR Plan, Incident Report.
- **Product spec**: Brief, Flows, Screens, Data Model, Architecture, Build
  Plan, Setup, Design Doc.
- **Code**: README, API Reference, CLAUDE.md, CHANGELOG, Setup & Deploy Guide.

Starters use `{{org.*}}`, never hard-coded Q7 details.

### Template editor (admin)

Section list (drag to reorder, add by kind) with a settings pane; form-builder
tab; **Test run** with sample values (costed, marked as a test, kept out of
history); **Publish** freezes a `template_version` (documents keep theirs);
Duplicate; Import/Export YAML.

## 6. Screens and editor

| Screen | Who | What |
|---|---|---|
| First run | — | First admin, org details and logo, OpenRouter key check, budget. |
| Sign in | all | Username + password; 15-minute lock after 5 failures. |
| Documents | all | Search and filter by status, client, category, author; "Waiting for your review" strip. |
| New document | editor+ | The wizard (§3). |
| Editor | editor+ (reviewer read-only) | Below. |
| Review | reviewer+ | Print preview, diff against last approved, Approve / Request changes with comment. |
| Clients & projects | all | List and detail with linked documents; "From monkiro" chip on synced rows. |
| Templates | admin | List and editor (§5). |
| Spend | admin | Month vs budget, by model / template / user, recent runs. |
| Settings | admin | Users and roles, models, budget and caps, ignore and redaction, connectors, org. |

Editors and reviewers can approve someone else's version; reviewers cannot edit.

### Editor

```
┌ Navbar: Simple Docs · Documents · Clients · Templates · Spend ─── [user] ┐
├──────────────┬─────────────────────────────────────────┬────────────────┤
│ OUTLINE      │  Acme — Project handover   [Draft]       │ ▸ Details      │
│ ● Summary    │  ─────────────────────────────────────── │ ▸ Sources      │
│ ● Systems    │  ## Summary                     [✦ ▾]    │ ▸ Versions     │
│ ◌ Topology…  │  …                                       │ ▸ AI runs      │
│ ○ Support    │  ## How it fits together        [✦ ▾]    │ ▸ Review       │
│ [Print       │  ┌ mermaid ─────────────┐                │                │
│  preview]    │  │ (live diagram)  [</>]│                │                │
├──────────────┴─────────────────────────────────────────┴────────────────┤
│ Saved · v7      [Export ▾]   [Open PR]   [Send for review]               │
└──────────────────────────────────────────────────────────────────────────┘
```

- TipTap with headings, lists, checklists, tables, links, code, images (paste
  or drag, captions), a gold callout node, a Mermaid node (live render, `</>`
  for source), and a section node per top-level section carrying the ✦ menu.
  Field-filled text is lightly tinted until edited.
- Streaming state per section: ● done, ◌ writing (scan band), ○ queued.
  Finished sections are editable while others write.
- **Print preview** renders the WeasyPrint HTML/CSS in the middle column.
- **Versions**: view, diff, Restore (new version).
- **Edit lock**: one editor at a time, 30 s heartbeat, released after 2 min
  idle; others see "<name> is editing" and get read-only.

## 7. Exports and pull requests

### Markdown

TipTap JSON → GitHub-flavoured Markdown. Pipe tables, ```` ```mermaid ````
blocks, callouts as `> **Note:**`, images to `assets/<slug>-n.png` (zip when
present). No front matter. **Docs pack**: several documents of one project as
a numbered set (`01-product.md` …) with an index README.

### PDF (WeasyPrint)

- Mermaid rendered client-side to SVG and stored as an `asset`; the worker
  needs no browser.
- `branded`: dark cover (`space-darkBlue`, faint stars, logo, title, client,
  date, version, status); light body (white page, `#0b1220` text,
  `space-blue` h2 with hairline, gold callout rule, dark text on light fills,
  system sans, mono for code).
- Running header (title · client), footer (org · page x of y · version), TOC
  when > 4 sections, no split table rows, headings kept with what follows.
- `plain`: no cover, slim header, same body.
- DRAFT: diagonal gold watermark unless the version is approved or the template
  does not require approval.

### Word

HTML → Pandoc with `export/reference.docx` (styles: Heading 1–3 in
`space-blue`, body, table, caption). Cover built with python-docx and
prepended. Diagrams as high-resolution PNG. DRAFT as a header watermark.

### GitHub pull request

1. Pick documents and a path for each (from `default_path`).
2. If the file exists: diff, then **Replace** or **Merge** (AI keeps
   hand-written sections and updates the rest; result shown before commit).
3. Worker branches `simple-docs/<doc-slug>-<short-sha>` from the analysed
   commit (warns if `main` has moved), commits with
   `Co-authored-by: <user>`, opens a PR whose body lists source commit,
   template, model and a link back. State refreshed on open.
4. Never pushes to `main`; never auto-merges.
5. Local-path sources: download only.

## 8. Errors and testing

### Errors

| Failure | Behaviour |
|---|---|
| OpenRouter 429 / 5xx / dropped stream | Backoff 1, 5, 30 min; finished sections kept; after 3 attempts the section offers Retry or write it yourself. |
| OpenRouter 402 or model withdrawn | No retry; message links to Settings → Models. |
| No ZDR provider at run time | Fall back to the category default and say so. |
| Over budget / cap | Refused before sending; no `ai_run` row. |
| Invalid JSON (outline, table) | One retry with the parse error; then template-derived outline, or table shown as text with a warning. |
| Mermaid parse error | One retry; then code block plus "Diagram didn't render" callout. |
| Clone fails / no access | GitHub's message plus which token is in use. |
| Path escapes root / unsafe zip | Rejected with the reason; logged. |
| Export fails | Error shown on the export; Markdown still available; details in worker logs. |
| monkiro unavailable | Sync marked failed, local copies keep working, banner on Clients. |
| Lock lost | On save, if the version moved on, show the diff; never overwrite silently. |

All API errors: `{ "error": { "code", "message", "fields"? } }`, messages
written for people.

### Testing

- **API** (pytest, real Postgres in Compose): one test per rule that tries to
  break it; redactor recall 100% on a planted-secrets fixture repo without
  flagging ordinary identifiers; ignore list never leaks `.env`, keys or
  symlinks outside the root; zip traversal/symlink/bomb fixtures; full
  pipeline against a **fake OpenRouter** (scripted streams, 429s, bad JSON,
  bad Mermaid); status and role permissions.
- **Exports**: golden fixture per section kind; exact Markdown; PDF text and
  page count plus image snapshots of cover and first body page; docx heading
  styles and watermark.
- **Front end**: Vitest (wizard, section menu, TipTap ↔ Markdown round trip);
  one Playwright run end to end (sign in → handover from notes → stream from
  the fake → edit → review → approved PDF).
- **Live smoke** (`make smoke`, manual only): one real OpenRouter call on the
  cheapest model.
- **CI**: GitHub Actions runs pytest, Vitest, Playwright, ruff, mypy, eslint,
  tsc on every PR.

## 9. Q7 website

In `q7-technology`:

1. `src/data/projects.ts`: add `simple-docs` (icon `FileText`, status
   `in-development`, MIT, tags Open source · Self-hosted · Python · React ·
   PostgreSQL · OpenRouter). Tagline: *Point it at the work. Get the
   document.*
2. `src/pages/SimpleDocsPage.tsx`, modelled on `SimpleLmsPage.tsx`: hero with
   `InDevelopmentBadge`, **What it will do** (six cards, each a mechanism),
   **How it fits** (inputs → redactor → OpenRouter ZDR → editor → review →
   exports), **Where it's up to** (milestones from the implementation plan),
   **Stack**, closing CTA. Any pre-release screenshot carries the gold
   **Simulated demo** label.
3. `src/App.tsx`: route `/projects/simple-docs`.
4. `src/lib/routeMeta.ts`: entry with title, description and
   `SoftwareSourceCode` JSON-LD, `codeRepository`
   `https://github.com/q7-technology/simple-docs`.

The site deploys to Cloudflare Pages on push to `main`. Build and check
locally; commit and push only with explicit approval. The GitHub repo
`q7-technology/simple-docs` must exist before the page goes live.

## Build steps

Each step gets its own detailed plan (`docs/plans/<date>-step-N-<name>.md`)
written just before it is built, and each ends usable end to end.

| Step | Name | Usable at the end |
|---|---|---|
| 0 | Site page | `/projects/simple-docs` on the Q7 site, In development (in `q7-technology`). |
| 1 | Skeleton | Compose (`db`, `api`, `caddy`), config, users and roles, sessions, first run, org settings, append-only trigger helper, CI. Desktop shell in the Q7 theme: sign in, first run, Users, Settings → Org. |
| 2 | Documents by hand | Clients & projects, templates seeded from YAML (5 starters), documents and append-only versions, TipTap editor with `fixed`/`field` sections filled, version history and restore, edit lock, Markdown export. |
| 3 | Writing with AI | Worker and `job` queue, OpenRouter client (ZDR, streaming, usage), model cache, budget and cap, redactor on notes and form values, outline → sections over SSE, section tools, `ai_run`, Spend screen, fake OpenRouter for tests. |
| 4 | Repos | GitHub clone, local path under `DOCS_REPO_ROOT`, zip/folder upload, ignore list, deterministic analysis, file summaries cache, per-section selection, redaction report and "View what's sent". |
| 5 | Review and print | Draft → In review → Approved, reviewer ≠ author, print preview, branded/plain PDF via WeasyPrint, Word via Pandoc, DRAFT watermark, docs pack. |
| 6 | Visuals | Images (paste, drag, captions), Mermaid node and `diagram` sections, `table` sections, callouts; all through every export. |
| 7 | Templates | Admin template editor, form builder, test run, publish, import/export YAML; all 25 starter templates. |
| 8 | Outward links | GitHub pull requests (replace or merge), monkiro connector (import/sync clients and jobs). |

## Out of scope for v1

SSO; real-time co-editing; inline review comments; write-back to local
folders; connectors other than monkiro; hosted or multi-tenant use; a light
theme for the app.
