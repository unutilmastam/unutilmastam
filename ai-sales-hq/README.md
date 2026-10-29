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

Errors: `{"error": {"code", "message" (Uzbek), "details"?, "requestId"}}`; every response carries `X-Request-ID`.

Security: Argon2id, server-side sessions (hashed tokens, `__Host-` cookie, HttpOnly, Secure, SameSite=Strict, idle + absolute expiry), CSRF (Origin check + double-submit header), DB-backed login throttling, TOTP mandatory in production, CSP/HSTS via Helmet, audit log for every auth event, log redaction.
