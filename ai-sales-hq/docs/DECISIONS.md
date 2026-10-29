# Decisions

Status values: **Accepted** · **Proposed** (default we will use unless the owner objects) · **Pending** (needs an owner answer).

| ID | Decision | Status |
|---|---|---|
| D-001 | Runtime stack depends on the hosting answer: Node/TS if "Setup Node.js App" ≥ 20 exists, otherwise Python (Smyagent stack) | **Pending** (hosting checklist §1) |
| D-002 | Reuse Smyagent designs everywhere; reuse its code only if D-001 resolves to Python | Proposed |
| D-003 | Separate application on its own subdomain `agent.unutilmastam.uz` | Proposed |
| D-004 | Firestore integration = server-side Admin SDK, read-only service account, cron sync | Accepted (A3) |
| D-005 | Wholesale prices are unconfigured; the PWA has only one price | Accepted (finding) |
| D-006 | Firestore data is untrusted input | Accepted |
| D-007 | MySQL 8 via the ORM; integer so'm | Accepted (A2, A8) |
| D-008 | DB job queue + one-minute cron worker, ≤ 50 s budget | Accepted (A2), interval pending |
| D-009 | Separate owner notification bot; never share `@UnutilmasTamBot`'s token | Accepted (A5) |
| D-010 | Root PWA security issues are reported, not fixed, in this project | Accepted |
| D-011 | Virtual office in SVG + CSS (A13), mapping logic ported from Smyagent | Proposed |

---

## D-001 — Runtime stack (Pending)

**Context.** SPEC_AMENDMENTS A2 prescribes Next.js static export + a Node.js API on cPanel "Setup Node.js App" + Prisma/MySQL. Smyagent's environment check on the same provider (hosting1.hostmaster.uz, 2026-10-25) found **no `node`/`npm` on the shell PATH** and verified Setup **Python** App 3.10–3.13. The check did not query the Node.js selector, so Node.js App support is unknown.

**Options.**

| | A. Node/TypeScript (spec default) | B. Python (Smyagent stack) |
|---|---|---|
| Server runtime | Setup Node.js App (Passenger) — **unverified** | Setup Python App 3.12 — **verified** on this provider |
| Frontend | Next.js static export built in GitHub Actions, uploaded as static files | Jinja2 + HTMX server-rendered PWA, no build step (Smyagent ADR-0003) |
| ORM / migrations | Prisma + MySQL | SQLAlchemy + Alembic + MySQL (tested on MySQL 8.0) |
| Firestore | `firebase-admin` (Node) | `firebase-admin` (Python) |
| Code reuse from Smyagent | Design/patterns only (re-implementation) | Direct code reuse of the infrastructure modules (queue, runner, auth, TOTP, bot, backups, deploy, office mapping) |
| Deploy from a phone | CI builds `web/out` + `api/dist`; deploy needs build artifacts on the server (release branch or archive) | `git pull` + `pip install` + `alembic upgrade` via one script (proven) |
| Premium UI (MASTER_SPEC §6) | Easier with React/Tailwind | Achievable with hand-written CSS + HTMX; slower for rich interactions |

**Decision rule.**
- If the owner's cPanel offers **Setup Node.js App with Node ≥ 20** and Passenger runs it → **A** (follow the spec).
- If not → **B**, and record the deviation from A2 here.
- Prisma note for A: Prisma's query engine is a native binary; on CloudLinux it must match the host OpenSSL. Phase 1 CI will build for `rhel-openssl-3.0.x`; if that fails on the server we switch to Drizzle/Kysely (pure JS).

**Not chosen:** hosting the API elsewhere (VPS / Railway / Render). It would move personal data outside Uzbekistan (A9) and add a paid service.

## D-002 — Smyagent reuse (Proposed)

**Context.** FIRST_COMMAND step 2 and A1 ask whether to reuse Smyagent's agent lifecycle and virtual-office UI instead of duplicating.

**Decision.**
1. **Do not merge the two products or share one deployment/database.** Different businesses (IT services vs frozen food), different data, different owner bots, different subdomains. A shared database would mix personal data of two businesses.
2. **Do not create a shared library package.** There is no package registry and the owner cannot publish one; a shared package would couple two release cycles.
3. **Reuse = copy with attribution**, per module, into `ai-sales-hq/`, adapted to this spec:

| Smyagent module | Reuse in AI Sales HQ | Notes |
|---|---|---|
| Job queue (`repositories/jobs.py`, `domain/jobs.py`, `jobs/runner.py`) — leases, idempotency, backoff, DB lock, run log | **Yes** (code if B, design if A) | Almost exactly A2 |
| Kill switch (`domain/agents.py`: ACTIVE/PAUSED/STOPPED, stricter wins) | **Partially** | A7 requires the richer 9-state machine with an explicit transition table, `STOPPING`, `ERROR` acknowledge, `DISABLED`. We keep Smyagent's "global switch, stricter wins" idea on top of A7. |
| Auth (Argon2id, sessions, throttling, CSRF, CSP, TOTP + recovery codes) | **Yes** | Matches A11 |
| Owner Telegram bot (webhook + secret header + numeric ID allow-list) | **Yes** | New bot token, A5 |
| Budget + usage accounting (`domain/budget.py`, `provider_usage`) | **Yes** | A6 budgets |
| Virtual office (`domain/office.py` mapping, `office.js` Canvas) | **Mapping: yes. Renderer: no** | A13 asks for SVG + CSS; we port the pure state→pose mapping and its tests, draw new SVG |
| Backups / restore drill / smoke test / deploy script | **Yes** | Phase 10 |
| Discovery (OSM), proposals, quality gate, Mustafo persona, website audit, email outreach | **No** | Different business; our discovery sources are A4 (Firestore stores → manual/CSV → Google Places) |
| CSV import with dry run | **Yes (pattern)** | A4 #2 |

**Open item.** Smyagent's `pyproject.toml` says `license: Proprietary`, author ITcoDe.Uz. The owner must confirm that copying its code into this repo is allowed (owner question Q5).

## D-003 — Separate app on `agent.unutilmastam.uz` (Proposed)

The live PWA (`unutilmastam.uz`, service worker scope `./`) must never be touched. Our PWA gets its own origin, so the two service workers and `localStorage` never interact, and session cookies are same-site with the API (A11). Fallback if a subdomain is impossible: `unutilmastam.uz/hq/` — rejected as default because the root service worker's scope `./` would include `/hq/`.

## D-004 — Firestore integration (Accepted, A3)

Server-side Admin SDK; service account with IAM role **Cloud Datastore Viewer** (read-only) only; JSON key stored outside `public_html` (`~/ai-sales-hq-data/firebase-sa.json`, mode 600), path in env. Cron sync every N minutes reads the documents `app/products`, `app/stores`, `app/orders`, `app/ledger` (and `app/categories`). `app/users` is read **only** for fields we need (store owner name/phone linked via `ownerUserId`); password hashes, photos and IPs are dropped at parse time and never stored or logged.

## D-005 — Wholesale prices unconfigured (Accepted)

The PWA has a single `price`; `originalPrice` is a crossed-out "old price". We import `price` as `RETAIL` (source `FIRESTORE`, status `OWNER_UNCONFIRMED` until the owner confirms once). Wholesale prices are entered by the owner in AI Sales HQ. Agents never quote a wholesale price that the owner has not entered.

## D-006 — Firestore data is untrusted (Accepted)

Because the live Firestore appears world-writable (audit S1), every synced field is validated (types, integer so'm, sane ranges, string lengths). A sync that would change more than a configurable share of prices at once (default 30 %) is held for owner review instead of applied. Store coordinates generated by the PWA's random-near-Tashkent fallback are flagged as `LOCATION_UNKNOWN`.

## D-007 — MySQL, integer money (Accepted)

MySQL 8 (verified on the provider). Money columns `DECIMAL(18,0)` / BigInt, no floats; timestamps UTC; business timezone Asia/Tashkent.

## D-008 — DB queue + minute cron (Accepted; interval pending)

As A2. If the plan's minimum cron interval is > 1 minute, the worker runs at the minimum interval and the UI shows the real next-run time (no fake "instant").

## D-009 — Separate owner bot (Accepted)

`@UnutilmasTamBot` (Railway backend) keeps its token. AI Sales HQ creates a new owner-only bot. Integration with the customer bot, if ever needed, goes through an authenticated HTTP endpoint, not a shared token.

## D-010 — Root PWA issues are out of scope (Accepted)

CLAUDE.md forbids changes outside `ai-sales-hq/`. Findings S1–S9 are reported to the owner in `PROJECT_AUDIT.md` §4; fixing them would be a separate, explicitly approved task.

## D-011 — Virtual office SVG + CSS (Proposed)

A13: SVG + CSS, no 3D, no Canvas game loop. Smyagent's tested pure mapping (`character_state`) is ported; figures show only persisted state.
