# Deployment on hostmaster.uz cPanel (technical)

Owner-facing steps: `DEPLOY_UZ.md`. Decision record: D-020. Nothing here runs without the owner
pressing "Deploy HEAD Commit" in cPanel (A14).

## Topology

| Item | Value |
|---|---|
| URL | `https://agent.unutilmastam.uz` (own subdomain; the website in `public_html` is untouched) |
| Node app (Passenger) | app root `~/ai-sales-hq-app`, startup `apps/api/dist/server.js`; serves the API and the static PWA (`apps/web/out`) |
| Settings | `~/ai-sales-hq-data/hq.env` (600), read by server, worker and ops tools (`lib/env-file.ts`) |
| Database | cPanel MySQL, `DB_NAME`/`DB_USER`/`DB_PASSWORD` (or `DATABASE_URL`) |
| Worker | cron every minute → `deploy/cron-worker.sh` → `worker.js --once --max-seconds 50` (DB lock) |
| Backups | cron daily + before each deploy → `deploy/backup.sh` → `~/ai-sales-hq-backups/hq-*.sql.gz` (600), 14 days |
| Previous release | `~/ai-sales-hq-previous` (for `deploy/rollback.sh`) |
| Logs | `~/ai-sales-hq-data/logs/worker.log` (rotated at 5 MB × 3); Passenger log (usually `~/ai-sales-hq-app/stderr.log` on CloudLinux; not yet verified); deploy `~/.cpanel/logs/*git_deploy.log` |

## Release bundle (`scripts/build-release.sh`, CI job "Release bundle + deploy drill")

- `apps/api/dist/{server,worker,ops}.js`: esbuild CJS bundles of the compiled API (Node ≥ 20.19 target 20). Prisma's query compiler is embedded WebAssembly, so no Prisma engines or CLI ship.
- `apps/api/node_modules/@node-rs/argon2{,-linux-x64-gnu}`: the only native module (glibc x64). It lives below `apps/api/` because CloudLinux's Node selector reserves a root-level `node_modules` for its virtualenv symlink.
- `apps/api/prisma/migrations`: applied by `ops.js migrate` (`lib/migrator.ts`), which writes the same `_prisma_migrations` rows and checksums as `prisma migrate deploy` (verified in CI against a Prisma-migrated database; `prisma migrate status` reports up to date).
- `apps/web/out`, `deploy/*.sh`, `.cpanel.yml`, `VERSION`.
- About 26 MB. Published to the generated branch `ai-sales-hq-release` (its own history, unrelated to `main`) only from `main`, only after lint/typecheck/unit, MySQL integration, browser tests (run against this bundle) and secret scan are green, and after the deploy drill passes.

## Deploy (`deploy/deploy.sh`, run by `.cpanel.yml`)

1. Find Node in `~/nodevenv/ai-sales-hq-app/*/bin/node` (highest), require ≥ 20.19.
2. First run: create `hq.env` with fresh `APP_SECRET_KEY`/`SETUP_TOKEN`, stop.
3. `ops.js check-config` with the new code (prints variable names only).
4. `backup.sh pre-deploy` (stops the deploy if the dump fails).
5. Copy the running app to `~/ai-sales-hq-previous`.
6. `ops.js migrate` (forward-only; a failed migration is recorded and blocks further runs until the pre-deploy backup is restored).
7. Copy the bundle to the app root (rsync, cp fallback), `touch tmp/restart.txt`.
8. Health check `APP_ORIGIN/api/v1/ready` (6 × 5 s).

The CI drill runs exactly this on a fake home directory (first run → settings file → second run →
idempotent third run → server start from the app root → cron run → backup → delete → restore → rollback).

## Rollback

Code: `deploy/rollback.sh` (Terminal) or revert on `main` (a new release is published). Data:
migrations only add tables/columns; to undo a deploy completely, restore its `*-pre-deploy` backup.

## Not verified on the real plan yet (HOSTING_CHECKLIST_UZ.md)

Node version list, cron minimum interval, `mysqldump`/`rsync`/`curl` availability for cron and
deployment tasks, Passenger request timeout, outbound HTTPS to Google/Telegram/Anthropic, memory
limits. The scripts fail with an explicit message where they depend on these.
