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

## Phase 2 — Database schema + Firestore product sync ✅ (code done; CI pending)
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
- [ ] Green CI run

## Phase 3 — Director Control Center + agent lifecycle + cron worker
- [ ] A7 state machine (9 states incl. STOPPING) in one domain module with a full transition-table test
- [ ] AuditLog row on every transition (actor, from, to, reason, time)
- [ ] Job table with leases (`locked_until`, `attempts`, `run_at`, `idempotency_key`), backoff, dead-letter view
- [ ] `worker --once`: DB lock, ≤ 50 s budget, state check before each job and between steps
- [ ] Scheduled catalog sync job (interval from the integration settings)
- [ ] Schedules (working days/hours, Asia/Tashkent), per-agent daily task limit, AI budget → `PAUSED / BUDGET_EXCEEDED`
- [ ] Control Center UI (functional, mobile): list, details, start/pause/resume/stop/disable/re-enable, history, failures
- [ ] Polling 5–10 s; UI shows only persisted state
- [ ] Owner Telegram bot (new token): notifications + `/status`, `/stop_all`
- [ ] Green CI run

## Phase 4 — Premium interface + virtual office (real data)
- [ ] Design system (graphite / midnight navy / champagne-gold), tokens, light + dark, accessible contrast
- [ ] Centralized Uzbek Latin strings (RU optional later)
- [ ] Responsive layouts: phone bottom navigation, iPad/desktop office-first
- [ ] Virtual office: SVG + CSS, 6 rooms (HQ, Director, Research, Sales, Communication, Orders), click → agent view
- [ ] Figures driven only by persisted state (ported mapping from Smyagent, D-011); `prefers-reduced-motion`
- [ ] Dashboard (MASTER_SPEC §17) computed from DB; draft/approved/delivered values clearly separated
- [ ] PWA manifest + service worker (static shell only), own origin
- [ ] Playwright smoke at 375 px and iPad width in CI
- [ ] Green CI run

## Phase 5 — Customer discovery
- [ ] Source 1: existing stores from Firestore (already synced) → prospects/customers with provenance
- [ ] Source 2: manual mobile form + CSV import with dry run
- [ ] Source 3: Google Places adapter (server key, budget cap, ToS-compliant caching) + mock
- [ ] Normalization (phone +998, names, Surxondaryo districts), dedup, provenance, last-verified
- [ ] Scoring with explanation (Business Analyst role), manual review queue
- [ ] Suppression / do-not-contact
- [ ] ⏳ Owner: Google Places API key (only if he wants source 3)
- [ ] Green CI run

## Phase 6 — Sales workflow (assisted manual) + AI drafting
- [ ] Opportunity stages (A10) with transition rules
- [ ] AI provider interface, structured outputs, schema validation, timeouts, budgets, usage records, mock in CI
- [ ] Draft messages (Uzbek Latin default, Russian optional) from verified catalog only
- [ ] Assisted-manual buttons: `tel:`, `https://t.me/<username>`, `sms:` with prefilled text; outcome recording
- [ ] Hidden for suppressed contacts; contact frequency limits
- [ ] Price negotiation / special terms → escalate to owner
- [ ] ⏳ Owner: AI provider API key
- [ ] Green CI run

## Phase 7 — Order preparation + owner handoff + notifications (MVP complete)
- [ ] Order statuses (A10) + separate payment status UNPAID/PARTIAL/PAID (owner-only)
- [ ] Price snapshot per item; `PRICE_CHANGED` re-confirmation; server-side totals
- [ ] Availability = UNKNOWN unless verified → owner review
- [ ] READY_FOR_OWNER_REVIEW → in-app + Telegram notification
- [ ] DELIVERED and payment changes owner-only
- [ ] End-to-end MVP walkthrough in CI with mocks
- [ ] Green CI run → **MVP**

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

## Phase 10 — cPanel deployment guide + backups
- [ ] `DEPLOYMENT_HOSTMASTER.md` (technical) + Uzbek step-by-step from a phone
- [ ] Subdomain, AutoSSL, app setup, env, migrations, cron entries
- [ ] Backup cron: daily `mysqldump`, keep 14 days, outside `public_html`; restore drill
- [ ] Rollback procedure; smoke test after deploy
- [ ] Deploy only with explicit owner approval (A14)
