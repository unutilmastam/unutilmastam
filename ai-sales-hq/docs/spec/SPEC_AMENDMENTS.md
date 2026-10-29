# AMENDMENTS TO "UNUTILMAS TA'M AI SALES HEADQUARTERS" SPEC (v1.1)

Paste this block ABOVE the original master specification. Where this block and the original conflict, THIS BLOCK WINS.

---

## A1. Known environment (do not re-discover, but verify)

- Owner works only from a phone and iPad. There is no local dev machine. All builds, tests, migrations and checks MUST run in GitHub Actions. Every phase must end with a green CI run, not "it works locally".
- Hosting: cPanel shared hosting at hostmaster.uz. No VPS, no root, no Docker, no Redis, no systemd/PM2.
- Existing Unutilmas Ta'm system (unutilmastam.uz):
  - Single-file / modular-JS PWA backed by **Firebase Firestore** (project `unutilmastam-27858`). There is NO REST product API.
  - It already has **dual retail/wholesale pricing**, a store owner approval flow, a store map and debt tracking.
  - A Python/aiogram Telegram bot runs on the same cPanel, plus an Unutilmas Ta'm Telegram group.
- A related project exists: `unutilmastam/Smyagent` (SMY Agent, AI sales agent with virtual office). Phase 0 must inspect it and record in DECISIONS.md whether this project reuses its code (agent lifecycle, office UI) instead of duplicating it.

## A2. Hosting-compatible topology (replaces Section 3 defaults and Section 22 assumptions)

Default production topology for cPanel shared hosting:

| Component | Original spec | Corrected default |
|---|---|---|
| Frontend | Next.js (SSR) | Next.js **static export** (`output: 'export'`) as PWA, served as static files from `public_html/<subdomain>` |
| API | Persistent Node server | Node.js API (Fastify or Express) via cPanel **"Setup Node.js App"** (Passenger). Assume the process can be stopped/restarted at any time. No in-memory state. |
| Database | PostgreSQL | **MySQL/MariaDB** (cPanel standard), via Prisma. Use PostgreSQL only if Phase 0 confirms the plan offers it. |
| Job queue | Persistent queue + worker | **Database-backed job table** with leases (`locked_until`, `attempts`, `run_at`, `idempotency_key`), processed by a **cPanel cron job every minute** running `node worker.js --once` with a hard time budget (≤ 50 s) and a DB lock so two runs never overlap. |
| Real-time status | (unspecified / WebSockets implied) | **Polling** (5–10 s) or SSE if Passenger allows; no WebSockets. |
| Scheduler | Background scheduler | Same cron entry evaluates agent schedules each minute. |

- This is NOT "silently replacing reliable background processing": it is the documented, persistent, DB-backed queue. Long tasks must be split into resumable steps that fit one cron run.
- Do NOT move personal data (prospect contacts, customers) to managed databases outside Uzbekistan (see A9). External managed services may be used only for non-personal data, and only after owner approval.
- Phase 0 must verify on the real plan: Node.js version available, MySQL version, cron frequency limit, outbound HTTPS allowed, max execution time, memory limit. Record results in PROJECT_AUDIT.md.

## A3. Product integration (corrects Section 4)

- The "website" is a Firestore app, not an HTML site with an API. Primary integration: **server-side Firebase Admin SDK** with a read-only service account, reading the products collection.
- Service account JSON lives only in a server env var / file outside `public_html`. Never in the PWA bundle.
- Do not scrape the PWA HTML.
- Wholesale prices: if Firestore already holds wholesale prices, sync them, but mark them `OWNER_UNCONFIRMED` until the owner confirms once in the UI. Section 13 rule "treat wholesale as unconfigured" applies only if no such field exists.
- Firestore changes can be picked up by scheduled sync (cron); webhooks are optional (would need a Cloud Function).

## A4. Customer discovery sources (makes Section 10 concrete)

"Permitted sources" must be explicit. In priority order:
1. **Existing store list** in the Unutilmas Ta'm Firestore app (stores, map points, past orders) — highest quality, already customers or known contacts.
2. **Manual entry / CSV import** by the owner (fast mobile form).
3. **Google Places API** (official, paid, key server-side). Respect its ToS: cache only what the terms allow (place_id long-term; other fields with refresh). Budget cap in settings.
4. Yandex/2GIS only via official APIs and only if their terms allow storage for this use; otherwise exclude.
- Forbidden: scraping Yandex Maps / 2GIS / Google Maps HTML, Instagram scraping, Telegram userbots.
- Default region filter: Surxondaryo viloyati (Termiz, Denov, Sho'rchi, Sherobod, Jarqo'rg'on, Qumqo'rg'on, Boysun, Sariosiyo, Uzun, Angor, Qiziriq, Muzrabot, Oltinsoy, Bandixon).

## A5. Communication channels (corrects Section 11 — critical)

- **Telegram bots cannot start a conversation** with a user who has not started the bot first. Cold outreach via Telegram Bot API is technically impossible. Telegram is for inbound conversations, follow-ups with users who opened the bot, and owner notifications.
- **Reuse the existing aiogram bot token only if** the two systems never both poll/set webhook. One token = one consumer. Default: create a **separate bot** for owner notifications, and integrate with the existing customer bot through a shared API endpoint, not a shared token.
- Telegram userbots (automating a personal account) are forbidden (ToS violation, account ban risk).
- WhatsApp Business Platform: only after Meta business verification; show NOT CONFIGURED by default.
- SMS (e.g. Eskiz.uz, Play Mobile): adapter only; marketing SMS requires recipient consent and sender name registration. Default disabled.
- Email: low value for small shops in Surxondaryo; keep adapter, default disabled.
- **Default initial outreach mode = "assisted manual"**: the system drafts the message, the owner taps a button that opens the shop's phone (`tel:`), Telegram (`https://t.me/<username>`) or SMS app with the text prefilled, and then marks the result. This works today with zero provider approvals.
- Message language per contact: Uzbek Latin default, Russian optional.

## A6. Orchestration (corrects Sections 9 and 16)

- Orchestration is **deterministic code** (state machine + job queue), not an LLM. "Director AI" is an LLM role used only for: summarizing results, writing daily reports, suggesting next actions. It never assigns jobs directly; it proposes, and code validates.
- Default: one AI provider, one cheap model for classification/drafting, a stronger model only on demand. Combine roles into as few calls as possible.
- Default budgets (editable): daily AI spend limit, per-task token limit, per-agent daily task limit. When the limit is hit, agents move to PAUSED with reason `BUDGET_EXCEEDED`.
- Send minimal personal data to AI providers (business name/category OK; phone numbers and personal names should be masked unless needed).

## A7. Agent lifecycle (corrects Section 8)

Add state `STOPPING`. Define the full transition table and enforce it in one module with tests:

```
DRAFT     -> STOPPED
STOPPED   -> SCHEDULED | RUNNING | DISABLED
SCHEDULED -> RUNNING | PAUSING | STOPPING | DISABLED
RUNNING   -> PAUSING | STOPPING | ERROR | SCHEDULED (outside working hours)
PAUSING   -> PAUSED
PAUSED    -> RUNNING | SCHEDULED | STOPPING | DISABLED
STOPPING  -> STOPPED
ERROR     -> STOPPED | DISABLED   (manual acknowledge required)
DISABLED  -> STOPPED              (re-enable never auto-starts)
```

- Every transition writes an AuditLog row (actor, from, to, reason, timestamp).
- Worker checks agent state before taking each job and between job steps.

## A8. Time and money (corrects Sections 12 and 14)

- Store timestamps in UTC. Business timezone = **Asia/Tashkent (UTC+5)**, used for all schedules, working hours, communication hours and reports. Never use server local time.
- UZS has no minor units in practice: store amounts as **integer so'm** (`BigInt`/`DECIMAL(18,0)`). No floats anywhere in money code.
- Order items store a **price snapshot** (unit price, price source, price type RETAIL/WHOLESALE, snapshot time). If the catalog price changes before owner approval, the order is flagged `PRICE_CHANGED` and must be re-confirmed; it is never silently recalculated.

## A9. Legal / data (adds to Section 15)

- Uzbekistan personal data law (ZRU-547) requires personal data of Uzbek citizens to be stored on servers physically in Uzbekistan. hostmaster.uz satisfies this; foreign managed databases for prospect/customer data do not. Document this in SECURITY.md; owner should confirm with a lawyer.
- Do-not-contact and opt-out apply to all channels including assisted-manual mode (the button is hidden for suppressed contacts).

## A10. Pipeline split (corrects Section 12)

The single status chain mixes two different entities. Split them:

- **Prospect / Opportunity stages**: `NEW -> NEEDS_VERIFICATION -> QUALIFIED -> CONTACT_PENDING -> CONTACTED -> INTERESTED -> NEGOTIATION -> WON | LOST | DO_NOT_CONTACT`
- **Order statuses**: `DRAFT -> CUSTOMER_CONFIRMATION_PENDING -> READY_FOR_OWNER_REVIEW -> APPROVED_FOR_DELIVERY -> DELIVERED -> CLOSED`, plus `NEEDS_INFORMATION`, `ON_HOLD`, `REJECTED`, `CANCELLED`, `PRICE_CHANGED`.
- Add a separate **payment status**: `UNPAID | PARTIAL | PAID` with amount paid and amount due (the business already tracks store debts). Only the owner changes it.
- `DELIVERED` and payment changes are owner-only actions.

## A11. Authentication

- Single owner + optional staff. Owner login: password (argon2/bcrypt) + **TOTP 2FA** or Telegram Login Widget as second factor. No public sign-up.
- Sessions: httpOnly, Secure, SameSite=Strict cookies on the same domain as the API (use `agent.unutilmastam.uz` or `/api` path on the same subdomain to avoid cross-site cookies).

## A12. Phase order and MVP (corrects Section 2)

The original builds the premium UI (Phase 2) before data, auth and agents exist, which produces a UI on fake data. New order:

0. Repository + hosting inspection (incl. Smyagent repo, Firestore structure, cPanel limits)
1. Foundation + auth + CI (green GitHub Actions with MySQL service container)
2. Database schema + Firestore product sync
3. Director Control Center + agent lifecycle + cron worker
4. Premium interface + virtual office (now on real data)
5. Customer discovery (existing stores + manual + Google Places)
6. Sales workflow in assisted-manual mode + AI drafting
7. Order preparation + owner handoff + notifications
8. Optional channel adapters (WhatsApp/SMS/email) — only when credentials exist
9. Hardening + E2E (Playwright in CI)
10. cPanel deployment guide + backup cron (`mysqldump` daily, kept 14 days, outside `public_html`)

**MVP = phases 0–7.** Phase 8 is optional.

## A13. Virtual office

- 2D/isometric SVG + CSS only. No 3D engine. Must stay smooth on iPad and mid-range Android.
- Agent figures show real persisted state only; an agent shown "working" must have a RUNNING state and an active or recent job.
- Respect `prefers-reduced-motion`.

## A14. Things this spec must NOT do

- Must not push to GitHub or deploy without explicit owner approval in the conversation.
- Must not overwrite unutilmastam.uz, its Firestore data or its bot. Firestore access is read-only.
- Must not mark any channel CONNECTED without a successful real test call.
