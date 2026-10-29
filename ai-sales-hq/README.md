# Unutilmas Ta'm — AI Sales HQ

AI-assisted sales headquarters for Unutilmas Ta'm (frozen food, Surxondaryo). Specification:
[`docs/spec/SPEC_AMENDMENTS.md`](docs/spec/SPEC_AMENDMENTS.md) (wins) and [`docs/spec/MASTER_SPEC.md`](docs/spec/MASTER_SPEC.md).
Status and phases: [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) · Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · Decisions: [`docs/DECISIONS.md`](docs/DECISIONS.md).

## Layout

```
apps/api   Fastify + TypeScript API, Prisma 7 (MySQL 8), worker (from Phase 3). Serves apps/web/out in production.
apps/web   Next.js static export (PWA), Tailwind CSS, Uzbek Latin UI
docs/      audit, plan, architecture, decisions, specs
```

## Checks (same as CI, `.github/workflows/ai-sales-hq.yml`)

```bash
npm ci
npm run check                      # Biome lint + format
npm run typecheck
npm run test:unit -w @hq/api
npm run test -w @hq/web
NODE_ENV=production npm run build  # API -> apps/api/dist, web -> apps/web/out

# Integration tests need a MySQL 8 database:
export TEST_DATABASE_URL=mysql://root:root@127.0.0.1:3306/hq_test
(cd apps/api && DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy)
npm run test:integration -w @hq/api
```

## Running locally

```bash
cp apps/api/.env.example apps/api/.env   # fill DATABASE_URL, APP_ORIGIN=http://127.0.0.1:3001, APP_SECRET_KEY, SETUP_TOKEN
                                         # optional: FIREBASE_SERVICE_ACCOUNT_FILE (docs/FIRESTORE_SETUP_UZ.md)
(cd apps/api && npx prisma migrate deploy)
NODE_ENV=production npm run build
node apps/api/dist/server.js             # http://127.0.0.1:3001 -> /setup creates the owner, then 2FA enrolment
```

For UI work: `npm run dev -w @hq/api` (port 3001) and `npm run dev -w @hq/web` (port 3000, proxies `/api`); set `APP_ORIGIN=http://localhost:3000`.

## API (so far)

| Method | Path | Access | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | public | liveness |
| GET | `/api/v1/ready` | public | readiness incl. database ping (503 if not ready) |
| GET | `/api/v1/setup/status` | public | `{needsSetup, setupEnabled}` |
| POST | `/api/v1/setup` | public + `SETUP_TOKEN` | create the first owner (only when no user exists) |
| POST | `/api/v1/auth/login` | public | password step → session, or `{status:"totp_required"}` |
| POST | `/api/v1/auth/login/totp` | public + challenge cookie | TOTP or recovery code → session |
| GET | `/api/v1/auth/me` | session | user, permissions, CSRF token |
| POST | `/api/v1/auth/logout` | session | revoke session |
| POST | `/api/v1/auth/password` | session | change password, logs out other devices |
| POST | `/api/v1/auth/totp/setup` / `confirm` | session | enrol 2FA, returns 10 one-time recovery codes |
| GET | `/api/v1/catalog/products[?inactive=1]`, `/catalog/products/:id` | catalog.view | products with current retail/wholesale price and status; detail with price history |
| POST | `/api/v1/catalog/seed` | prices.confirm | load the owner's initial list into an empty catalog |
| POST | `/api/v1/catalog/prices/:id/confirm` | prices.confirm | confirm a current price |
| POST | `/api/v1/catalog/products/:id/price` `{type, amount}` | prices.confirm | owner price (wholesale; retail only for non-website products) |
| GET | `/api/v1/integrations/firestore` | integrations.manage | status, settings, last 10 sync runs |
| POST | `/api/v1/integrations/firestore/test` \| `/sync` \| `/settings` | integrations.manage | real connection test, manual sync, schedule |
| POST | `/api/v1/integrations/firestore/runs/:id/apply` | integrations.manage | apply the latest held sync |
| GET/POST | `/api/v1/notifications`, `/:id/read`, `/read-all` | system.view | in-app notifications |
| GET | `/api/v1/control/overview` | agents.view | agents (state, reason, current job, limits, allowed actions), worker liveness, queue |
| POST | `/api/v1/agents/:key/:action` | agents.control | activate, start, pause, resume, stop, disable, enable, acknowledge |
| POST | `/api/v1/agents/:key/settings` | agents.control | working days/hours (Tashkent), daily task limit |
| GET | `/api/v1/agents/:key/history`, `/api/v1/jobs[?status=]` | agents.view | transition history, recent jobs with events |
| POST | `/api/v1/control/stop-all` | agents.control | kill switch |
| GET/POST | `/api/v1/integrations/telegram`, `/test`, `/webhook` | integrations.manage | owner bot status, real test message, register webhook |
| POST | `/api/v1/telegram/webhook` | secret header | owner bot commands `/status`, `/stop_all` |
| GET | `/api/v1/prospects[?stage&district&q&page]`, `/prospects/:id` | prospects.view | list with score/contacts/sources; detail with history |
| POST | `/api/v1/prospects`, `/prospects/import/preview`, `/prospects/import` | prospects.edit | manual entry; CSV dry run; CSV import |
| POST | `/api/v1/prospects/:id/stage` \| `/notes` \| `/contacts` \| `/score`, `/contacts/:id/verify` | prospects.edit | pipeline (A10), notes, contacts, rescore, verify |
| GET/POST | `/api/v1/discovery`, `/discovery/settings`, `/firestore-import`, `/places-search` | prospects.view / settings.manage | source status, budget, settings, run now |
| GET/POST | `/api/v1/suppression` | prospects.view / prospects.edit | do-not-contact list |
| GET | `/api/v1/outreach`, `/prospects/:id/conversation` | prospects.view | owner desk (decisions, drafts, follow-ups); conversation |
| POST | `/api/v1/prospects/:id/draft` \| `/reply-draft` \| `/inbound` \| `/outcome` \| `/owner-resolved` | prospects.edit | assisted-manual workflow |
| POST | `/api/v1/messages/:id/edit` \| `/sent` \| `/discard` | prospects.edit | edit (re-checked), confirm sent with channel, discard |
| POST | `/api/v1/sales/settings` | settings.manage | cooldown, daily limit, signature, language, AI on/off and budget |
| GET/POST | `/api/v1/integrations/ai`, `/integrations/ai/test` | integrations.manage | AI status, spend, real test call |

Background work: cron runs `node apps/api/dist/worker.js --once` every minute (DB lock, ≤ 50 s budget).

Errors: `{"error": {"code", "message" (Uzbek), "details"?, "requestId"}}`; every response carries `X-Request-ID`.

Security: Argon2id, server-side sessions (hashed tokens, `__Host-` cookie, HttpOnly, Secure, SameSite=Strict, idle + absolute expiry), CSRF (Origin check + double-submit header), DB-backed login throttling, TOTP mandatory in production, CSP/HSTS via Helmet, audit log for every auth event, log redaction.
