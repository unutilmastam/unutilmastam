# Decisions

Status values: **Accepted** · **Proposed** (default we will use unless the owner objects) · **Pending** (needs an owner answer).

| ID | Decision | Status |
|---|---|---|
| D-001 | Node.js/TypeScript stack as in A2 (Fastify API + Next.js static export + Prisma 7/MySQL) | **Accepted** 2026-10-29 (owner: build what the spec says) |
| D-002 | Reuse Smyagent designs (queue, kill switch, auth, office mapping), not its Python code | Accepted |
| D-003 | Separate application on its own subdomain `agent.unutilmastam.uz` | Proposed |
| D-004 | Firestore integration = server-side Admin SDK, read-only service account, cron sync | Accepted (A3) |
| D-005 | Wholesale prices are unconfigured; the PWA has only one price | Superseded by D-019 for the live v14.5 site |
| D-006 | Firestore data is untrusted input | Accepted |
| D-007 | MySQL 8 via the ORM; integer so'm | Accepted (A2, A8) |
| D-008 | DB job queue + one-minute cron worker, ≤ 50 s budget | Accepted (A2), interval pending |
| D-009 | Separate owner notification bot; never share `@UnutilmasTamBot`'s token | Accepted (A5) |
| D-010 | Root PWA security issues are reported, not fixed, in this project | Accepted |
| D-011 | Virtual office in SVG + CSS (A13), pose mapping in `domain/office.ts` | Accepted |
| D-012 | Firestore read via REST + service-account JWT instead of the `firebase-admin` package | Accepted |
| D-013 | Catalog sync safety: price versions, mass-change hold, seed retired by live data | Accepted |
| D-014 | Worker, lifecycle and budget semantics (Phase 3) | Accepted |
| D-015 | Discovery sources, dedup, scoring and data handling (Phase 5) | Accepted |
| D-016 | AI drafting: provider, models, quality gate, budget, privacy (Phase 6) | Accepted |

---

## D-001 — Runtime stack (Accepted 2026-10-29)

**Decision.** The owner asked to build exactly what the specification describes, so we use the A2 default: Node.js 22 + TypeScript, Fastify API, Next.js static export served by the same Node process (one Passenger app, one origin), Prisma 7 with the pure-JS query compiler and the `@prisma/adapter-mariadb` driver (no native query engine binary — removes the CloudLinux OpenSSL risk below). Python is not used.

**Remaining risk.** "Setup Node.js App" on the owner's cPanel is still unverified. If it is missing, the API cannot run on hostmaster.uz; the fallback is to ask hostmaster.uz to enable Node.js for the account. The hosting checklist §1 answers this before Phase 10 (deployment).

### Original analysis (Phase 0)

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

## D-011 — Virtual office SVG + CSS (Accepted, Phase 4)

A13: SVG + CSS, no 3D, no Canvas game loop. One small SVG scene per room (instead of one large floor plan) so text stays legible at 375 px. The server computes each figure's pose from persisted facts (`domain/office.ts`, idea from Smyagent's `character_state`): *working* only when RUNNING with an active job or one finished in the last 2 minutes; idle, off-hours, lounge (paused), alert (error) and empty desk for the rest. Animations are CSS keyframes, disabled under `prefers-reduced-motion`. Polling every 10 s on the dashboard.

## D-012 — Firestore over REST, not `firebase-admin` (Accepted, Phase 2)

A3 asks for "server-side Firebase Admin SDK with a read-only service account". We keep the substance (server-side, service account, IAM role **Cloud Datastore Viewer**, key file outside `public_html`) but call the Firestore REST API directly with a self-signed RS256 JWT (`src/integrations/firestore.ts`, ~150 lines, only `GET`):

- `firebase-admin` pulls in gRPC and ~100 MB of resident memory; CloudLinux LVE memory limits on shared hosting are tight (hosting checklist §4).
- We read exactly two documents (`app/products`, `app/categories`); the REST surface is enough and fully unit-tested with a fake `fetch`.
- The code physically cannot write: there is no write method, and the IAM role would refuse it anyway.

## D-013 — Catalog sync safety (Accepted, Phase 2)

- Prices are versioned rows (`product_prices`): a change supersedes the previous row (`validTo`), never updates it. Synced retail prices start `OWNER_UNCONFIRMED`; the owner confirms each once (A3). Owner-entered wholesale prices are `CONFIRMED` immediately.
- Retail prices of `FIRESTORE` products cannot be overridden in this app — the website is authoritative (MASTER_SPEC §4/§5).
- Mass-change guard (D-006): if more than 30 % of existing active products change price or disappear, or the source suddenly has zero valid products, the run is `HELD`. The owner sees the diff and can apply it (a fresh read applied without the guard, audit-logged).
- Products missing from the source are deactivated, never deleted.
- Seed products (owner list, MASTER_SPEC §5) are retired automatically when a live product with the same normalized name and weight appears.
- Sync runs are serialized with a MySQL lease lock (`locks` table) shared with the future cron worker.
- Scheduled sync (every `intervalMinutes`) is executed by the Phase 3 cron worker; Phase 2 provides manual sync and stores the schedule setting.

## D-014 — Worker, lifecycle and budget semantics (Accepted, Phase 3)

- **Who settles transitional states.** `PAUSING → PAUSED` and `STOPPING → STOPPED` happen immediately when the agent has no running job (in the same request), otherwise at the job's next checkpoint or at the end of the worker run. The UI shows the transitional state until then — it never pretends.
- **Job interrupted by pause/stop.** A job halted at a checkpoint because its agent left RUNNING goes back to the queue without spending an attempt; a stop additionally cancels queued jobs of that agent.
- **Disable requires stop.** A7 has no `RUNNING → DISABLED`; the UI offers *Stop* first.
- **Daily task limit.** Counts jobs started since Tashkent midnight. Hitting it moves the agent `RUNNING → PAUSING → PAUSED` with reason `BUDGET_EXCEEDED` (A6) and notifies the owner. Such a pause is lifted by the worker after midnight (`PAUSED → RUNNING/SCHEDULED`, reason `BUDGET_RESET`); owner pauses are never lifted automatically. Rationale: A6 says "PAUSED", and making the owner resume every morning would defeat a daily limit.
- **Dead job → agent ERROR.** A job that exhausts its retries puts a RUNNING agent into ERROR (A7: manual acknowledge required) and raises a critical notification.
- **System jobs.** Owner notification delivery (`notify.telegram`) belongs to no agent, so it keeps working after `/stop_all`.
- **Unavailable agents.** Agents whose capabilities arrive in later phases exist as DRAFT and refuse `activate`/`start`, so the office never shows an agent "working" without real work (A13).
- **Owner bot replies** are returned inside the webhook response (no outbound call needed); notifications use `sendMessage` from the worker.

## D-015 — Discovery sources, dedup, scoring, data handling (Accepted, Phase 5)

- **Sources (A4), in priority order:** existing stores from the PWA's Firestore (read-only), manual entry/CSV, Google Places API (New). No HTML scraping of any map service, no Instagram, no Telegram userbots. Yandex/2GIS are not integrated (their terms for storing results were not confirmed).
- **Places terms.** Only `place_id` is stored indefinitely; other Places content carries `expiresAt = observed + 30 days`. A daily job refreshes expired records via Place Details (within the budget) or redacts them (rating, address, unverified Places phones); the business name is kept so the owner can still recognise the record.
- **Budget.** Every Places request is counted per Tashkent day in `provider_usage` with an estimated list-price cost; requests stop at the owner's daily cap (default 50).
- **Dedup.** `place_id` → normalized phone → normalized name + district (switchable). A merge only fills empty fields, so owner edits are never overwritten by automatic sources; each source adds a provenance row.
- **Scoring is deterministic** (category, district in the delivery region, contact, verification, past orders, Google rating, location certainty), with the points and reasons stored next to the score. No LLM is involved in Phase 5; AI drafting arrives in Phase 6.
- **Qualification.** Automatic `QUALIFIED` only when a contact is verified and the score reaches the threshold (default 45); everything else waits in `NEEDS_VERIFICATION` — public visibility does not authorise messaging (MASTER_SPEC §10).
- **Do-not-contact** is reachable from every stage and final. It writes suppression records for the prospect, its phones/Telegram and its place_id; future imports of those contacts start in `DO_NOT_CONTACT`.
- **Personal data.** Store owner names and phones are personal data: stored only in the MySQL database on hostmaster.uz (A9) and masked before any future AI call (`formatPhone(…, masked)`). Private customers of the PWA (`userType: customer`) are never imported.

## D-016 — AI drafting (Accepted, Phase 6)

- **What the AI does.** Only phrases a short message (first offer or a reply). Orchestration, prices, stages, limits and every decision are code (A6). The owner reads every message and sends it himself (A5 assisted manual); the server never contacts a customer.
- **Provider and models.** Anthropic through the official TypeScript SDK (`messages.parse` with a zod schema → validated JSON, `output_config.effort: "low"`, `stop_reason: "refusal"` checked). Models are configuration, not code: `AI_MODEL` defaults to `claude-haiku-5-5` (A6: one cheap model for drafting), `AI_MODEL_STRONG` to `claude-opus-5-5`, used only when the owner presses "Kuchliroq model bilan". Haiku 5.5 has no server-side refusal fallback; a refusal or any API error falls back to the deterministic template, so drafting never stops.
- **Quality gate** (deterministic, `domain/sales.ts`): any price that is not a currently **confirmed** catalog price, any discount/free/percent wording, promises (delivery dates, guarantees, credit), links, phone numbers or excessive length mark the draft `NEEDS_EDIT`; it cannot be marked as sent until the owner edits it and it passes.
- **Escalation.** Customer messages about price, discount, wholesale, credit or delivery terms flag the conversation for the owner; the reply draft for such messages is a fixed template ("the manager will contact you") — the AI is not even called.
- **Budget.** Every call is recorded with tokens and list-price cost (no prompt or message text stored). When today's spend reaches the owner's daily budget (default 1 $), the Communication agent goes `PAUSED` with `BUDGET_EXCEEDED` and resumes after Tashkent midnight (D-014).
- **Privacy (A6/A9).** The prompt contains the business name, category, district, product lines and, for replies, the conversation with phone numbers masked. Owner/contact person names and phone numbers are never sent.
- **Limits.** Default cooldown of 7 days between first contacts of the same business, daily draft limit 20, both owner-editable.

## D-017 — AI key entered in the app (Accepted, Phase 6)

- **Why.** The owner works from a phone; pasting a key into the app is simpler than cPanel environment variables plus a restart.
- **Where it lives.** `system_settings` row `ai.provider`: the key sealed with AES-256-GCM (key derived from `APP_SECRET_KEY` via HKDF, purpose `ai-api-key`), its last 4 characters, the two models and the save time. The key is never returned by any endpoint, never logged (`apiKey` is a redacted log path, `sk-…` is redacted in text) and not written to the audit log (only last 4 + models).
- **Saving = testing.** `POST /integrations/ai/key` makes a real minimal call with the new key and model first; on failure nothing is stored and a working key is kept. Models are limited to those with known prices so every call can be costed. Models can change without re-entering the key.
- **Precedence.** A key saved in the app wins over `ANTHROPIC_API_KEY`; the env variable remains a fallback. Drafters are resolved per call (cached by key + models), so a saved, changed or removed key takes effect immediately in the API and in the next worker run — no restart.
- **Rotation of `APP_SECRET_KEY`.** The sealed key can no longer be opened; status becomes `ERROR` ("kalitni qayta kiriting"), drafting falls back to templates, nothing crashes.
- **Access.** `integrations.manage` (owner) only; save, rejected attempt, model change, removal and test are audit-logged.

## D-018 — Orders and owner handoff (Accepted, Phase 7)

- **Who builds an order.** The owner or staff, from the prospect page, after a real conversation (assisted manual, A5). No AI reads conversations into orders: quantities and products are entered by a person; the Order Manager agent only validates prices. The server never contacts the customer — the confirmation text is copied or opened in the SMS app by the owner, and the customer's answer is recorded by hand.
- **Prices.** Each line snapshots the current **confirmed** price (retail or wholesale) with its id, source and time. Unconfirmed prices cannot be ordered. A line is stale when the current confirmed price for that product/type is a different row or amount. Stale lines move the order to `PRICE_CHANGED` (A8) at customer confirmation, at approval, or when the Order Manager's 10-minute check runs; the total is never recalculated silently. Saving the items again re-snapshots and returns the order to `DRAFT`, so the customer confirms the new price.
- **Statuses.** `DRAFT → CUSTOMER_CONFIRMATION_PENDING → READY_FOR_OWNER_REVIEW → APPROVED_FOR_DELIVERY → DELIVERED → CLOSED`, with `NEEDS_INFORMATION`, `ON_HOLD`, `REJECTED`, `CANCELLED`, `PRICE_CHANGED` (table in `domain/orders.ts`). Owner-only targets: approved, rejected, on hold, delivered, closed. Updates are conditional on the status read (no lost updates).
- **Money.** BigInt so'm end to end in the database and calculations; API responses carry plain numbers (amounts stay far below 2^53). Payments only after approval, never above the total, guarded against concurrent writes; payment status is derived (`UNPAID/PARTIAL/PAID`).
- **Idempotency.** One open draft per prospect (create returns the existing one); the review notification is deduplicated per order; the price check job is keyed per 10-minute bucket.
- **Availability.** The catalog has no verified stock data, so every line shows `UNKNOWN` and the owner decides (MASTER_SPEC §12).
- **Dashboard figures.** Draft value, approved value, delivered value and recorded payments are separate; only recorded payments are money received.

## D-019 — Integration with the live website v14.5 (Accepted)

- **Which code.** The site running on hostmaster.uz is the modular v14.5 (`docs/LIVE_SITE_V14_5.md`), newer than the single file at the repo root. The integration follows the live version; neither copy is modified.
- **Split documents.** Keys above 300 000 characters are stored in parts; the reader joins them exactly like the website (all parts must carry the meta timestamp) and fails the run otherwise — the next scheduled sync retries. At most 64 parts are accepted.
- **Shop price.** `priceStore` (> 0) is the price the website shows to approved store owners. It is imported as a `WHOLESALE` price (source `FIRESTORE`, `OWNER_UNCONFIRMED` until the owner confirms once), like retail in D-005. A wholesale price the owner enters in AI Sales HQ is kept until the **website** value changes (compared with the last value read from the site), so the two never overwrite each other in a loop. Shop-price changes count towards the mass-change guard.
- **Images.** `/uploads/…` URLs count as a product image (we still only record that one exists).
- **Store owners.** Registrations the owner rejected on the website (`storeStatus: rejected`) are not imported as prospects; pending and approved ones are.
- **Website overview ("Sayt" page).** A live, read-only view: new and today's orders, store vs personal order counts, recent store orders, store debts from the ledger, pending store-owner registrations, products with shop prices and out of stock, stores without a map location. Nothing from it is stored; personal customers appear only as counts. Owner-only (`integrations.manage`).
- **Still read-only.** Nothing is written to Firestore or to the website's hosting folder. Orders prepared in AI Sales HQ stay in AI Sales HQ; the owner enters accepted orders on the website as before.

## D-020 — Deployment: prebuilt bundle via a release branch and cPanel Git (Accepted, Phase 10)

- **Why.** The owner has no computer and shared hosting may kill `npm install` (memory) or lack the OpenSSL the Prisma engines need. So the server never builds or installs anything.
- **Bundle.** CI compiles, bundles API/worker/ops with esbuild (Prisma's WASM query compiler is embedded), adds the argon2 native package under `apps/api/node_modules` (CloudLinux reserves the root `node_modules`), the static PWA, migrations and the deploy scripts. The browser tests run against this bundle.
- **Delivery.** From `main` only, after every check is green and a full deploy drill passes, CI commits the bundle to the `ai-sales-hq-release` branch (generated content; it never touches `main` or the website files at the repository root). The repository is public, so cPanel Git clones it without keys; the owner presses "Update from Remote" and "Deploy HEAD Commit".
- **Migrations without the CLI.** `ops.js migrate` applies `prisma/migrations` with the same `_prisma_migrations` bookkeeping (sha256 checksums) as `prisma migrate deploy`, under a MySQL named lock; CI checks both tools agree.
- **Settings.** One file `~/ai-sales-hq-data/hq.env` (600) for server, cron and deploy — cPanel's per-app environment screen does not reach cron jobs. The database can be given as `DB_*` parts so passwords with symbols need no URL encoding. The first deploy generates the secrets.
- **Safety.** Every deploy backs up the database first and keeps the previous copy; a failed config check, backup or migration stops the deploy before the running app changes.

## D-021 — Design system v2 (Accepted)

- **Goal.** The owner asked for an interface that reads as a premium, professional product, not a toy. The look follows high-end operations software: quiet layered graphite surfaces, one restrained champagne accent, strong typographic hierarchy, real numbers up front.
- **Type.** Inter Variable, self-hosted from `@fontsource-variable/inter` (OFL; CSP stays `'self'`), tabular numerals for every figure.
- **Tokens.** `globals.css` defines surfaces (`ink → graphite → panel → raised`), hairlines, text levels (`paper / mist / faint`), semantic colours and a gold gradient for the single primary action; light theme mirrors every token. Shared classes `surface`, `btn*`, `input*`, `eyebrow`, `skeleton` replace per-page Tailwind strings.
- **Shell.** Desktop: grouped sidebar (Asosiy / Sotuv / Ma'lumotlar / Tizim) with the user block; phone: glass top bar and five-item tab bar with safe-area padding. Page intros sit under the title; detail pages get a back link above it.
- **Dashboard.** KPI row (active agents, today's prospects, orders awaiting the owner, delivered value) from persisted data only; attention list, sales funnel, order values and integrations alongside the office. Loading uses skeletons, not text.
- **Virtual office (revised on the owner's request with a reference photo).** One panoramic, photographic-style night office in one-point perspective, drawn in SVG + CSS (A13: no 3D engine): wood-slat wall with cove light, ceiling light strips, a window onto a lit city (day/night by Tashkent time), timber floor with reflections, desks with two or three monitors, ergonomic mesh chairs, people seen from behind with screen rim light, lounge sofa, foreground depth-of-field leaves, vignette and grain. The wall display is live HTML (agents, their state, activity strips, last finished jobs, Tashkent clock); status labels above each person are the links to the agent. A photograph was not used as the background because its people could not reflect real state: here a person sits at a desk only while the agent works (working/idle/error/stopping), a paused agent sits on the lounge sofa, and off-hours/absent agents leave an empty chair and dark screens. On phones the scene scrolls sideways inside its frame (starting centred) with a text summary below.

