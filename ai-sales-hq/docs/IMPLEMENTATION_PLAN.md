# Implementation Plan

Phase order from SPEC_AMENDMENTS A12. **MVP = Phases 0–7.** Phase 8 is optional.
Rules: one phase per pull request; each phase ends with a green GitHub Actions run; owner approval before the next phase starts.

Legend: `[x]` done · `[ ]` to do · `⏳` waiting on owner.

---

## Phase 0 — Repository + hosting inspection ✅ (this PR, awaiting approval)
- [x] Inspect root PWA (`index.html`, `sw.js`, `manifest.webmanifest`, `firebase.json`, `lims/`) — read-only
- [x] Document Firestore structure: `app/{key}` → `{v: JSON string, t}`; products / stores / orders / ledger / users fields
- [x] Finding: no wholesale price field in the PWA
- [x] Secrets + security review of the root PWA (S1–S10)
- [x] Inspect `unutilmastam/Smyagent`; reuse decision (D-002)
- [x] Docs: PROJECT_AUDIT, IMPLEMENTATION_PLAN, ARCHITECTURE, DECISIONS, HOSTING_CHECKLIST_UZ
- [x] D-001 decided: Node/TS per A2 (owner: "build what the spec says")
- [ ] ⏳ Owner answers `HOSTING_CHECKLIST_UZ.md` (needed before Phase 10 deployment)
- [ ] ⏳ Owner answers questions Q1–Q6 (PR description)

## Phase 1 — Foundation + auth + CI ✅
- [x] npm workspaces `apps/api` (Fastify, Prisma 7) + `apps/web` (Next.js static export, Tailwind 4), strict TS, Biome lint/format
- [x] Config validation (fail fast in production), `.env.example`, `.gitignore`
- [x] Structured JSON logging with secret redaction, correlation IDs
- [x] Error envelope; `/api/v1/health`, `/api/v1/ready` (DB ping)
- [x] DB connection layer (MySQL 8), first migration (users, sessions, audit_log, login_attempts)
- [x] Owner bootstrap via `/setup` + one-time `SETUP_TOKEN` from the phone (no terminal; no public sign-up), password (Argon2id) + TOTP 2FA, recovery codes
- [x] Sessions: httpOnly, Secure, SameSite=Strict, same origin as API; CSRF; login rate limit
- [x] RBAC foundation (OWNER, STAFF), server-side checks only
- [x] GitHub Actions `ai-sales-hq.yml` (`paths: ['ai-sales-hq/**']`, `working-directory: ai-sales-hq`): install, typecheck, lint, unit tests, integration tests with **MySQL 8 service container**, build, dependency audit, secret scan
- [x] Green CI run ✅

## Phase 2 — Database schema + Firestore product sync ✅
- [x] Schema: Product, ProductPrice (versions), ProductSyncRun, Integration, Notification, SystemSetting, Lock (prospects/orders tables come with Phases 5 and 7)
- [x] Money as integer so'm (`BigInt`); UTC timestamps; UI shows Asia/Tashkent
- [x] Firestore adapter over REST with service-account JWT, read-only (D-012) + fake source for tests
- [x] Strict parser for `app/products` and `app/categories`; images reduced to a flag; invalid records reported
- [x] Upsert by external id, deactivate missing, price versions, mass-change hold + owner apply (D-013)
- [x] Synced retail prices `OWNER_UNCONFIRMED`; owner confirms; wholesale entered only by the owner (D-005)
- [x] Seed: owner catalog (MASTER_SPEC §5), retired automatically by matching live products
- [x] "Sayt bilan integratsiya" page: status (never CONNECTED without a real call), last sync, errors, test connection, manual sync, schedule setting, held-run review
- [x] Catalog page (confirm prices, set wholesale), in-app notifications (sync failed/held, prices to confirm)
- [x] Owner guide `docs/FIRESTORE_SETUP_UZ.md` (service account with Cloud Datastore Viewer only)
- [ ] ⏳ Owner creates the read-only service account (only needed after deployment)
- [x] Green CI run ✅

## Phase 3 — Director Control Center + agent lifecycle + cron worker ✅
- [x] A7 state machine (9 states incl. STOPPING) in `domain/agent-lifecycle.ts`; test covers all 81 state pairs
- [x] AuditLog row on every transition (actor, from, to, reason); conditional updates prevent races
- [x] Six agents (MASTER_SPEC §9); each may run only its own job types; agents of later phases stay DRAFT and cannot start
- [x] Job table with leases, idempotency keys, exponential backoff, DEAD after max attempts, stale-lease recovery, job events
- [x] `node dist/worker.js --once --max-seconds 50`: DB lock (no overlap), agent state checked before each job and at checkpoints, worker runs recorded for liveness
- [x] Pause/stop: queued work cancelled on stop, running job re-queued unharmed at its checkpoint, PAUSING/STOPPING settle when idle
- [x] Schedules (working days/hours, Asia/Tashkent, overnight windows), per-agent daily task limit → PAUSED `BUDGET_EXCEEDED`, lifted at Tashkent midnight (owner pauses never auto-lift)
- [x] Dead job on a RUNNING agent → ERROR + critical notification; owner must acknowledge
- [x] Scheduled catalog sync job (Director, interval from the integration settings)
- [x] Control Center UI: worker liveness, queue, per-agent state/reason/current job/limits/schedule, allowed actions only, stop-all; 5 s polling
- [x] Owner Telegram bot (separate token): notification delivery as a system job (works even when agents are stopped), webhook with secret header + chat allow-list, `/status`, `/stop_all`; CONNECTED only after a real call
- [ ] AI spend budget → `BUDGET_EXCEEDED` (hook is ready; AI usage arrives with Phase 6)
- [x] Green CI run ✅ (after the Phase 4 push: a fake test token tripped gitleaks; now built at runtime)

## Phase 4 — Premium interface + virtual office (real data) ✅
- [x] Design system: graphite / midnight navy / champagne-gold tokens as CSS variables; dark and light themes (toggle, remembered locally, applied before first paint)
- [x] Centralized Uzbek Latin strings (`apps/web/src/lib/strings.ts`)
- [x] Responsive layouts: phone bottom navigation with line icons, desktop/iPad top navigation, dashboard with office-first layout on desktop
- [x] Virtual office: SVG + CSS, 6 rooms (HQ, Director, Research, Sales, Communication, Orders); click → agent control
- [x] Figures from persisted state only (`domain/office.ts`: working = RUNNING + active/recent job; unit-tested that no other state is drawn working); `prefers-reduced-motion`
- [x] Dashboard (MASTER_SPEC §17) from DB: agents by state, tasks in progress, attention list, integration status (AI honestly NOT_CONFIGURED), last sync; prospect/order metrics shown as "Phase N", never as fake zeros
- [x] PWA service worker: hashed static assets cache-first, pages network-first, `/api` never cached
- [x] Playwright in CI at 375 px and iPad width: setup → login → mandatory 2FA → office → agent start/stop → catalog → integrations; checks for horizontal scroll (found and fixed a 3 px overflow on the catalog)
- [x] Green CI run ✅

## Phase 5 — Customer discovery ✅
- [x] Source 1: existing stores from Firestore (`app/stores`, store-type `app/users`, order counts from `app/orders`) — business fields only; passwords, photos, IPs and private customers dropped at parse time; the PWA's fake Tashkent fallback coordinates discarded
- [x] Source 2: manual mobile form + CSV import with dry run (`,`/`;`, quotes, BOM, Uzbek/Russian/English headers, row-by-row verdicts)
- [x] Source 3: Google Places API (New) Text Search, server key, Surxondaryo location restriction, daily request cap + usage/cost counter, ToS caching (content expires after 30 days → refreshed or redacted, place_id kept)
- [x] Normalization: phones to +998 E.164, Telegram usernames, business names, Surxondaryo district detection (Latin/Cyrillic/Russian spellings)
- [x] Dedup by place_id → phone → name + district (last one can be switched off), merge fills gaps only, provenance row per source
- [x] Deterministic, explained score (Business Analyst) + stage rules: only verified strong prospects auto-qualify, others go to the review queue
- [x] Pipeline stages (A10) enforced server-side; DO_NOT_CONTACT from any stage, final, suppresses phone/Telegram/place for future imports
- [x] Agents: Market Researcher (daily store import, rotating Places searches within budget, cache refresh) and Business Analyst (scoring) run in the cron worker
- [x] UI: prospects list (search, stage/district filters, paging), detail (contacts + verify, explained score, sources with links, history, notes, stage moves, inline DNC confirmation), manual entry, CSV import, discovery settings; phone "More" menu; dashboard prospect counts are real now
- [x] E2E: manual add → verify phone → qualified → DNC at phone and iPad width (found and fixed: top navigation overflowing at 820 px; native prompt() replaced — unreliable in installed iOS PWAs)
- [ ] ⏳ Owner: Google Places API key (optional; guide `docs/GOOGLE_PLACES_SETUP_UZ.md`)
- [x] Green CI run ✅

## Phase 6 — Sales workflow (assisted manual) + AI drafting ✅
- [x] Opportunity stages (A10) driven by real events: draft → CONTACT_PENDING, owner confirms sending → CONTACTED, outcomes → INTERESTED / LOST / DO_NOT_CONTACT, follow-up dates
- [x] AI provider interface; Anthropic via the official `@anthropic-ai/sdk` with structured output (`messages.parse` + zod), low effort, refusal handling; cheap model `claude-haiku-5-5` for drafts, `claude-opus-5-5` only when the owner asks for a better draft; both via env (D-016)
- [x] Every AI call recorded (`ai_usage_records`: tokens, list-price cost, no text); daily AI budget → Communication agent `PAUSED / BUDGET_EXCEEDED`, job waits unharmed
- [x] Drafts only from confirmed catalog prices; deterministic quality gate (unknown prices, discounts/free, promises, links, phone numbers, length) → `NEEDS_EDIT` until the owner fixes it; template drafts when no AI is configured or it fails
- [x] Assisted-manual buttons: `tel:`, `sms:` with prefilled text, `https://t.me/<username>` with the text copied; the owner confirms the channel; nothing is ever sent by the server
- [x] Suppressed contacts: no draft, no "sent" (A9); contact cooldown (default 7 days) and daily draft limit
- [x] Price / discount / credit / delivery-term questions from customers → conversation flagged "owner decides", warning notification; reply drafts never negotiate (escalation template)
- [x] Personal data masked before AI calls (phone numbers; owner names never sent)
- [x] Agents: Communication drafts for qualified prospects; Sales sends the morning follow-up reminder; Director's end-of-day report (numbers computed in code)
- [x] UI: "Murojaatlar" desk (owner decisions, drafts, follow-ups, settings), conversation panel on the prospect page, AI provider card, dashboard counts
- [x] E2E: verify → draft → mark sent by SMS → contacted → customer asks for wholesale price → owner-decision banner (phone + iPad)
- [x] AI key entered in the app (Integratsiya → AI provayder): real test call before saving, stored sealed with `APP_SECRET_KEY` (AES-256-GCM), only the last 4 characters shown, change models / remove key, audit log; takes effect without a restart; env `ANTHROPIC_API_KEY` stays a fallback (D-017)
- [x] Green CI run ✅
- [ ] ⏳ Owner: Anthropic API key (optional; guide `docs/AI_SETUP_UZ.md`) — until then templates are used

## Phase 7 — Order preparation + owner handoff + notifications (MVP complete) ✅
- [x] Order statuses (A10) enforced in one pure module (`domain/orders.ts`) with optimistic status updates and an event row + audit entry per transition; separate payment status UNPAID/PARTIAL/PAID with amount paid / due (D-018)
- [x] Price snapshot per item (unit price, price id, source, RETAIL/WHOLESALE, time) from **confirmed** catalog prices only; totals in BigInt so'm on the server, client totals ignored
- [x] `PRICE_CHANGED` when the catalog price moves before approval: checked at customer confirmation, at approval and every 10 minutes by the Order Manager agent (`orders.check_prices`); never silently recalculated — re-saving the items takes the new price and sends the order back to DRAFT
- [x] Missing information listed (items, address, phone, changed prices) and blocks the confirmation request; availability shown as UNKNOWN unless verified
- [x] Assisted-manual customer confirmation: confirmation text with copy / `sms:` button, the owner/staff records what the customer said (stored with time)
- [x] READY_FOR_OWNER_REVIEW → in-app notification (forwarded to the owner bot when configured), deduplicated per order
- [x] Approve / reject / hold, DELIVERED, closing and payments owner-only (server permissions + domain check); overpayment and concurrent payments refused
- [x] One open draft per prospect (repeat "create" returns it); prospect moves to NEGOTIATION on order and WON on delivery
- [x] Dashboard: orders awaiting review, draft / approved / delivered values and recorded payments kept apart; daily report counts
- [x] UI: Buyurtmalar list with status filters, order page (items editor, details, actions by status, payments, history), "Buyurtma tuzish" on the prospect page; bottom bar on phones
- [x] E2E: prospect → order → customer confirms → owner approves → payment → delivered (phone + iPad)
- [x] Green CI run → **MVP** ✅

## Phase 7b — Live website v14.5 integration ✅
- [x] Live site code reviewed (owner's archive); data model in `docs/LIVE_SITE_V14_5.md`
- [x] Split Firestore documents (`app/<key>__pN`) reassembled with the website's own consistency rule
- [x] Website shop price `priceStore` → unconfirmed wholesale price; owner overrides kept until the site changes (D-019)
- [x] Upload-URL images recognised; rejected store-owner registrations not imported
- [x] "Sayt" page: live read-only overview (orders, debts, pending owners, products) — personal customers only counted
- [ ] ⏳ Owner: service account key (`docs/FIRESTORE_SETUP_UZ.md`) after the agent is deployed on the hosting (Phase 10)

## Phase 8 — Optional channel adapters (only when credentials exist)
- [ ] WhatsApp Business Platform adapter (NOT CONFIGURED by default)
- [ ] SMS adapter (Eskiz.uz / Play Mobile), consent + sender name
- [ ] Email adapter
- [ ] CONNECTED only after a successful real test call

## Phase 9 — Hardening + E2E
- [ ] Playwright E2E (MASTER_SPEC §19 scenario) in CI
- [ ] Security tests (unauthorized access, disabled agents, duplicate jobs, opt-outs, unapproved discounts)
- [ ] Dependency audit, headers/CSP review, log redaction review
- [ ] SECURITY.md incl. ZRU-547 note (A9)

## Phase 10 — cPanel deployment guide + backups ✅ (code done; CI pending)
- [x] `DEPLOYMENT_HOSTMASTER.md` (technical) + `DEPLOY_UZ.md` (Uzbek, from a phone, no Terminal)
- [x] Release bundle built in CI (esbuild, ~26 MB, no npm/Prisma CLI on the server), published to `ai-sales-hq-release` from `main` after all checks (D-020)
- [x] cPanel Git "Deploy HEAD Commit" → `deploy/deploy.sh`: settings file, config check, pre-deploy backup, previous copy, migrations (Prisma-compatible runner), copy, restart, health check
- [x] Subdomain, AutoSSL, Node app, settings file (`~/ai-sales-hq-data/hq.env`, DB_* parts), cron entries documented
- [x] Backup cron: daily `mysqldump`, keep 14 days, outside `public_html`; restore + rollback scripts; full drill in CI
- [x] Deploy only by the owner pressing the button (A14)
- [ ] ⏳ Owner: answers to `HOSTING_CHECKLIST_UZ.md` (Node version, cron interval) and the first installation
