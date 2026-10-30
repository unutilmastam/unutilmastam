# Security — AI Sales HQ

Scope: the `ai-sales-hq/` app (API + static dashboard). The live PWA at the repo root is out of scope.

## Reporting
Security problems: write to the owner directly (Telegram), not in a public GitHub issue.

## Authentication and sessions
- Passwords hashed with Argon2id (`@node-rs/argon2`). No default account: the first owner is created once via `/setup` with a one-time `SETUP_TOKEN`.
- Optional TOTP 2FA; `TOTP_REQUIRED=true` makes it mandatory for every account.
- Login throttling per username and per IP (`LOGIN_MAX_FAILURES` in `LOGIN_WINDOW_MINUTES`), every attempt recorded.
- Session cookie: `HttpOnly`, `SameSite=Strict`, `Secure` in production, absolute lifetime `SESSION_ABSOLUTE_HOURS`.

## Authorization
- Every API route declares its access (`public`, `webhook`, `session`, or a named permission). The integration test `tests/integration/security.test.ts` walks the full route table and fails if:
  - a route is added without an access rule (only the 5 account self-service routes may be plain `session`, only 6 routes are public + the Telegram webhook);
  - an anonymous request reaches any private route (must be 401 — unknown API paths also answer 401, so paths cannot be probed);
  - a STAFF user reaches any owner-only route (must be 403).
- Owner-only actions: approving orders, delivery, payments, agent control, AI key, settings.

## CSRF
Two layers on every state-changing request: a foreign `Origin` is refused, and the double-submit token from `/auth/me` must come back in `x-csrf-token`. Both are tested.

## HTTP headers
Helmet: CSP `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'self'`; `nosniff`; HSTS (1 year, subdomains) in production only. `script-src`/`style-src` allow `'unsafe-inline'` because the Next.js static export inlines bootstrap code — no third-party origins are allowed. Every response carries `x-request-id`; error bodies contain only `{ code, message, requestId }`, never stack traces.

## Secrets
- Never committed. CI runs gitleaks on every push.
- Server settings live outside the web root (`~/ai-sales-hq-data/hq.env`).
- Secrets stored in the database (AI API key) are encrypted with AES-256-GCM, key derived from `APP_SECRET_KEY` (HKDF). The UI only shows the last characters.
- Logs: pino redaction of password/code/token fields plus text patterns (Telegram bot tokens, `sk-…` keys, MySQL passwords in URLs). Covered by `tests/unit/crypto-logger.test.ts`.

## Integrations
- Firestore (live site): read-only, no write path exists in code.
- Telegram webhook: `x-telegram-bot-api-secret-token` must match `TELEGRAM_WEBHOOK_SECRET`; owner chat bound by numeric ID.
- AI output is a draft: it cannot send, approve, change prices or move stages. Drafts that invent a price or discount are blocked until edited (tested).

## Agent safety
Paused/stopped agents take no jobs, stop cancels queued work, owner pause is never lifted automatically, budget limits pause agents, scheduled jobs are deduplicated per interval, `DO_NOT_CONTACT` is final and blocks drafting. All covered by integration tests (`worker`, `sales`, `prospects`, `orders`).

## Dependencies
CI: `npm audit --omit=dev --audit-level=high` (fails the build). Release bundle is built in CI only.

## Personal data — Uzbekistan law ZRU-547 (SPEC_AMENDMENTS A9)
The Law of the Republic of Uzbekistan "On Personal Data" (ZRU-547) requires personal data of Uzbek citizens to be stored on servers physically located in Uzbekistan.
- Prospect and customer data are stored only in the MySQL database at hostmaster.uz (Uzbekistan). Backups stay on the same host, outside `public_html`.
- No foreign managed database is used for prospect/customer data.
- The AI provider receives only what a draft needs (business name, product context); keep phone numbers and personal names out of prompts where possible.
- Only public business contacts are collected; opt-out (`DO_NOT_CONTACT`) is permanent.
- This is engineering guidance, not legal advice: the owner should confirm current requirements with a lawyer.
