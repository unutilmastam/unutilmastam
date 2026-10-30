# Architecture

Status: Phase 0 draft. The runtime language is pending (DECISIONS D-001); everything below is language-neutral unless marked **[A: Node]** or **[B: Python]**.

## 1. Context

```
                          ┌──────────────────────────────────────────────┐
  Owner (phone / iPad) ──►│  agent.unutilmastam.uz  (cPanel, hostmaster.uz) │
                          │                                              │
                          │  PWA (static or server-rendered)             │
                          │      │ same-origin /api, httpOnly cookie      │
                          │      ▼                                       │
                          │  API app (Passenger)  ──► MySQL 8            │
                          │      ▲                     ▲                 │
                          │      │ shared code         │                 │
                          │  worker --once  (cron, every minute, ≤50 s)  │
                          └──────┬───────────┬──────────┬────────────────┘
                                 │           │          │  outbound HTTPS
               Firestore (read-only)   AI provider   Telegram (owner bot) / Google Places
               project unutilmastam-27858

  Live PWA unutilmastam.uz  ── reads/writes ──►  Firestore   (untouched by us)
```

- One modular monolith: `web` (PWA), `api`, `worker`, shared `domain` code. No microservices.
- The API process may be killed by Passenger at any time → **no in-memory state**; everything in MySQL.
- The worker is not a daemon: cron runs it once per minute; it takes a DB lock, processes jobs until its time budget (≤ 50 s) ends, and exits.
- Real-time UI = polling every 5–10 s (no WebSockets).

## 2. Proposed repository layout (inside `ai-sales-hq/`)

```
ai-sales-hq/
  CLAUDE.md
  docs/                     audit, plan, architecture, decisions, spec/
  apps/
    web/                    PWA (A: Next.js static export | B: templates + static)
    api/                    HTTP API, auth, owner actions
    worker/                 cron entry: worker --once
  packages/ (A) | src/ (B)
    domain/                 pure logic: state machines, money, pricing, dedup, schedules — no I/O
    db/                     schema + migrations
    integrations/           firestore, ai, telegram, places — each behind an interface + mock
  tests/
  .env.example
  README.md
.github/workflows/ai-sales-hq.yml   (repo root; paths: ['ai-sales-hq/**'], working-directory: ai-sales-hq)
```

## 3. Module boundaries

| Module | Owns | Depends on |
|---|---|---|
| `auth` | users, sessions, TOTP, roles (OWNER, STAFF) | db |
| `catalog` | products, price list (RETAIL/WHOLESALE, source, confirmation), sync runs | db, integrations/firestore |
| `agents` | Agent, schedules, lifecycle (A7 state machine), budgets | db, audit |
| `jobs` | job table, leases, retries, idempotency, worker loop | db, agents |
| `prospects` | prospects, sources, contact points, suppression, dedup, scoring | db, integrations/places |
| `sales` | opportunities (A10 stages), conversations, messages, assisted-manual outreach | db, ai, prospects |
| `orders` | orders, items with price snapshot, payment status, approvals | db, catalog |
| `notifications` | in-app inbox, Telegram owner bot | db, integrations/telegram |
| `audit` | append-only AuditLog | db |
| `ai` | provider interface, structured output + schema validation, usage records | integrations/ai, agents (budget) |

Rule: `domain` is pure and fully unit-tested; financial arithmetic, authorization and state transitions live there, never in prompts (MASTER_SPEC §16).

## 4. Key flows

### 4.1 Firestore product/store sync (Phase 2)
1. Cron enqueues `catalog.sync` (idempotency key = time bucket).
2. Worker reads `app/products`, `app/categories`, `app/stores`, `app/orders`, `app/ledger` with the Admin SDK (read-only SA).
3. `JSON.parse(v)` → strict schema validation per record → drop sensitive fields (`password`, `photo`, `ipAddress`).
4. Upsert by external `id` (`p_…`, `s_…`); records missing from Firestore → `inactive` (never deleted).
5. Price change → new price version; open orders with the old snapshot → `PRICE_CHANGED`.
6. Mass change guard (D-006) → hold for owner review.
7. `ProductSyncRun` row with counts and errors; failure → notification.

### 4.2 Agent lifecycle (Phase 3)
Owner taps Pause → API validates transition `RUNNING → PAUSING` in the domain state machine → AuditLog row → worker sees `PAUSING` at its next checkpoint, finishes/aborts the current step, sets `PAUSED`. The UI shows `PAUSING` until the worker confirms; it never fakes the end state.

### 4.3 Assisted-manual outreach (Phase 6)
Agent drafts message → owner sees draft → taps `tel:` / `https://t.me/<user>` / `sms:` link with prefilled text → owner records outcome. Suppressed contacts have no button (A9).

### 4.4 Order handoff (Phase 7)
Order items snapshot price + source + type + time → server recomputes totals → `READY_FOR_OWNER_REVIEW` → in-app + Telegram notification → owner approves → `APPROVED_FOR_DELIVERY` → owner marks `DELIVERED` and payment (`UNPAID/PARTIAL/PAID`) manually.

## 5. Data placement and secrets

| Data | Location |
|---|---|
| Prospects, customers, conversations, orders | MySQL on hostmaster.uz (Uzbekistan, A9) |
| Firestore SA key, AI key, bot token, DB password, session secret | Files/env outside `public_html`, mode 600; never in git, never in the PWA bundle |
| Data sent to the AI provider | Business name/category/product data; phones and personal names masked (A6) |

## 6. Deployment shape (details in Phase 10)

- **[A: Node]** CI builds `apps/web/out` (static) and `apps/api/dist`; a release branch (or archive) holds the built artifacts; cPanel Git Version Control pulls it; Setup Node.js App points at `apps/api/dist/server.js`; static files go to the subdomain document root.
- **[B: Python]** Same as Smyagent: cPanel Git → `deploy.sh` (pip install, migrations, restart), Setup Python App 3.12 with `passenger_wsgi.py`.
- Both: cron `* * * * *` worker, daily `mysqldump` at 03:xx, 14 days, outside `public_html`.
