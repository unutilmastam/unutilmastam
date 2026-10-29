# Project Audit — Phase 0

Date: 2026-10-29 · Scope: `unutilmastam/unutilmastam` (root PWA, read-only) and `unutilmastam/Smyagent` (read-only).
Spec precedence: `docs/spec/SPEC_AMENDMENTS.md` > `docs/spec/MASTER_SPEC.md`.

Nothing outside `ai-sales-hq/` was modified. The live Firestore project was **not** queried; every statement about Firestore below is derived from the client code in `index.html`.

---

## 1. Repository inventory

| Path | What it is | Relevance to AI Sales HQ |
|---|---|---|
| `index.html` (1.34 MB, 7 885 lines) | The live Unutilmas Ta'm PWA: catalog, cart, orders, stores map, debts (`ledger`), couriers, chats, promo codes, admin panel. Vanilla JS, no build step. | **Data source** (products, stores, orders, debts) via Firestore. Never modified. |
| `sw.js` | Service worker `unutilmas-v55`: network-first for `index.html`, cache-first for cdnjs/Google Fonts. | None. Our app must use a different scope/subdomain so the two workers never collide. |
| `manifest.webmanifest` | PWA manifest, scope `./`. | None (same reason). |
| `firebase.json` | Firebase Hosting, site `unutilmastam`, `public: "."`, ignores `lims/**`. **No `firestore.rules` file is referenced or present.** | Confirms the PWA is (also) deployed to Firebase Hosting. Rules live only in the Firebase console. |
| `lims/` | **LabCore** — a separate laboratory management system (Node.js + PostgreSQL + Electron). Unrelated domain. | None. Not reused. Excluded from Firebase Hosting. |
| `UnutilmasTam.apk` (4.3 MB) | Android wrapper of the PWA. | None. |
| icons (`icon-*.png`, `apple-touch-icon.png`) | PWA icons. | Brand reference only. |
| `ai-sales-hq/` | This project: `CLAUDE.md` + specs. No code yet. | Work area. |

No root `package.json`, no lockfile, no CI, no tests, no README for the PWA. The root has no `.github/` directory.

---

## 2. How the PWA uses Firestore

### 2.1 Storage model — one document per top-level key

The PWA keeps the whole application state in one JS object `state` and mirrors it to Firestore as **one collection `app` with one document per top-level key**:

```
collection: app
  document id: <state key>          e.g. "products", "orders", "ledger"
  fields:
    v: string   // JSON.stringify(state[key]) — the entire array/object as ONE string
    t: number   // client-side Date.now() of the last local change (last-writer-wins)
```

- Reads: `fsDb.collection('app').onSnapshot(...)` — every client receives every document in real time.
- Writes: `batch.set(fsDb.collection('app').doc(key), {v, t})` — the whole key is overwritten.
- Offline cache: `localStorage['unutilmas-tam-v2']`.
- Firebase SDK: `firebase-app-compat` + `firebase-firestore-compat` 10.12.2. **Firebase Auth is not loaded**, so every Firestore request is unauthenticated.

Consequences for integration:
1. A sync is cheap: read ~5 documents (`products`, `stores`, `orders`, `ledger`, `users`) and `JSON.parse(v)`.
2. There are no per-record timestamps or IDs from Firestore; change detection must diff by the app's own `id` fields.
3. Each document is capped at 1 MiB. `orders` and `users` (base64 photos) will hit this as the business grows; the PWA will then silently fail to save. Our sync must tolerate a document that suddenly stops changing or fails to parse.

### 2.2 Keys (documents) found

`products`, `stores`, `users`, `orders`, `ledger`, `sales`, `notifications`, `chats`, `categories`, `sellerInfo`, `adminSettings`, `promoCodes`, `expenses`, `deliveryZones`, `couriers`.

### 2.3 Field structure (from object literals in `index.html`)

**`products`** — array of
```
{ id: "p_xxxxxxx", name, gram: number, unitType, price: number, originalPrice: number|null,
  stock: number, image: dataURL|null, category: <category id>, description,
  isHot?, rating?, reviewCount?, code? }
```
- `price` = the single selling price (UZS). `originalPrice` = the crossed-out "old price" shown as a discount badge (`originalPrice > price`). It is **not** a wholesale price.
- `stock` exists and is edited by the admin; trustworthiness unknown → we treat it as `UNVERIFIED` availability.

**`stores`** — array of
```
{ id: "s_xxxxxxx", name, ownerName, phone, address, lat, lng, ownerUserId: <users.id>|null }
```
Stores are created by the admin (map) or automatically when a customer places a "do'kon" order (matched by `phone`). Note: when a store order has no location, the PWA stores a **random point near Tashkent** (`41.3111±0.04, 69.2797±0.04`) — such coordinates are fake and must not be used for discovery or routing.

**`users`** — array of
```
{ id, personalId: "UT-XXXXXXX", name, contact (phone/email), password: "h1:<sha256>",
  userType: "customer"|"store", storeName?, address?, verified, tgVerified, tgPhone,
  homeLat, homeLng, photo: dataURL|null, ipAddress, points, blocked, createdAt }
```
The "store owner approval flow" = a user registers as `userType:"store"`; the admin links that user to a `stores` record (`ownerUserId`).

**`orders`** — array of
```
{ id: "o_xxxxxxx", userId, customerId, customerName, customerPhone,
  orderType: "dokon"|"shaxsiy", storeId, storeName, storeAddress, lat, lng,
  items: [{ productId, name, qty, gram, unitType, price }],   // price snapshot
  subtotal, total, paid, debt,
  paymentStatus: "kutilmoqda"|"qarz"|"tolandi",
  status: "yangi"|"yetkazildi"|"qaytarildi"|...,
  deliveryFee, deliveryZoneName, scheduledFor, deliveryTime, deliveredAt, courierId,
  promoCode: {code, discountPercent}|null, pointsUsed, date: "YYYY-MM-DD" }
```

**`ledger`** (debts) — array of
```
{ id: "l_xxxxxxx", partyType: "store", partyId: <stores.id>, partyName, ownerName,
  items, total, paid, debt, date, due: "YYYY-MM-DD"|null, status: "debt"|"paid" }
```

**`sales`** — direct counter sales `{ id, productId, productName, gram, price, ts }`.

### 2.4 Retail vs wholesale prices — finding

SPEC_AMENDMENTS A1 says the PWA "already has dual retail/wholesale pricing". **In the code at commit `4405feb` it does not.** There is exactly one price field (`price`); store ("do'kon") orders and personal orders use the same `p.price`. The only "do'kon" difference is the order form (store name/address/phone) and debt tracking.

→ Per A3 / MASTER_SPEC §13: **wholesale prices are treated as unconfigured** until the owner enters them in AI Sales HQ. If the owner says wholesale prices exist somewhere else (another app version, a spreadsheet, Firestore field added later), Phase 2 will map that field instead. Logged as an owner question.

### 2.5 Money

The PWA uses `parseFloat` and `Math.round` on amounts; values are numbers that are integers in practice. The sync must coerce to integer so'm and reject non-integers (A8).

---

## 3. Other integrations seen in the PWA

| Integration | Where | Notes |
|---|---|---|
| Telegram bot `@UnutilmasTamBot` | `TG_VERIFY = { bot, api: 'https://web-production-22aba.up.railway.app' }` | Registration OTP, `/notify-admin`, `/send-courier`. **The bot backend runs on Railway, not on cPanel** (contradicts A1 "aiogram bot on the same cPanel" — needs owner confirmation; maybe both exist). |
| Yandex Maps JS API 2.1 | `<script src="https://api-maps.yandex.ru/2.1/?apikey=…">` | Store map. |
| Leaflet/OpenStreetMap | fallback when `YANDEX_API_KEY` is empty | — |
| api.ipify.org | `fetchPublicIp()` on registration | Stores user IP in `users`. |
| Google AdSense | `ca-pub-5038263107741699` | Third-party script runs on the same page as the admin panel. |
| cdnjs (html2canvas, jsQR, jsPDF, qrcodejs) | receipts, QR | — |

There is **no REST API** for products (confirms A1/A3).

---

## 4. Security findings (root PWA)

Firebase web config (`apiKey: AIzaSy…`, `projectId: unutilmastam-27858`, `appId`, …) is public by design and is **not** a finding by itself. The findings below are real.

| # | Finding | Evidence | Risk |
|---|---|---|---|
| S1 | **Firestore is world-writable (inferred).** The PWA writes to `app/*` without Firebase Auth, so the security rules must allow unauthenticated read **and** write. Anyone with the public config can read every customer, overwrite prices, or delete all orders/debts with a few lines of JS. No `firestore.rules` is versioned in the repo. | `connectCloud()`, no `firebase-auth` script, `batch.set(...)`; `firebase.json` has no `firestore` section | **Critical** |
| S2 | **Admin login code is readable by anyone.** The admin "password" is `state.adminSettings.code`, stored in plaintext in Firestore document `app/adminSettings`, and compared in the browser. Default `TAM-2026` is hardcoded in `index.html` (`ADMIN_CODE`, `seedState`). | lines ~2573–2575, 2667, `authAdminLogin()` | **Critical** |
| S3 | **Password reset without verification.** "Parolni tiklash" sets a new password for any account given only its phone/email; entering the admin phone/email resets the **admin code**. Account takeover of every user and of the admin. | `submitForgotPassword()` | **Critical** |
| S4 | **Password hashes exposed.** `users[].password` = unsalted `SHA-256("utam:"+password)`, readable by anyone (S1). Short numeric passwords are cracked instantly offline. Old accounts may still hold plaintext passwords until next login. | `hashPass()`, `passMatches()` | **High** |
| S5 | **Personal data public.** Names, phones, home coordinates, IP addresses, face photos of all users; store owners' phones and debts — all in world-readable documents. Also a ZRU-547 concern: data of Uzbek citizens is stored in Google Cloud outside Uzbekistan. | `users`, `stores`, `ledger` | **High** (legal) |
| S6 | **OTP verified in the browser.** The registration code is generated and compared client-side (`entered !== pendingRegistration.code`) on the non-Telegram path; it can be bypassed from DevTools. | `generateOtpCode()`, verify handler | Medium |
| S7 | **Open relay on the Railway bot backend.** `POST /send-courier {chat_id, message}` and `POST /notify-admin {message}` are called from the browser with no credential, so anyone can make `@UnutilmasTamBot` send arbitrary text (phishing in the brand's name) to any chat that started the bot. Needs verification on the Railway side. | `notifyAdminViaBot()`, courier send | **High** (if unauthenticated server-side, which the client code implies) |
| S8 | Yandex Maps API key in HTML. Public by nature, but must have an HTTP-referrer restriction in the Yandex developer console, or it can be used (and billed/quota-exhausted) by others. | `<script src=…apikey=6f99…>` | Low |
| S9 | AdSense script runs with full DOM access on the page where the admin code and user passwords are typed. | `<script async src=…adsbygoogle.js>` | Low–Medium |
| S10 | No secrets found in git history (scanned all 83 commits for Telegram bot tokens, `sk-`/`sk-ant-` keys, GitHub tokens, private keys / service-account JSON). `lims/.env.example` contains placeholders only. | `git log --all -p` scan | — (good) |

**These findings are outside the scope of AI Sales HQ and nothing was changed.** Recommended owner actions (no code from us at the repo root without separate approval): restrict Firestore rules, move admin auth server-side, disable the unverified reset path, rotate the admin code. Until S1 is fixed, AI Sales HQ must treat Firestore data as **untrusted input** (validate every field; a vandal can write anything).

Impact on our design: our server reads Firestore with the Admin SDK and a dedicated read-only service account; it never needs the public config and never writes. Fixing S1 later (e.g. rules requiring auth) does not break our sync, because the Admin SDK bypasses rules.

---

## 5. Smyagent inspection (`unutilmastam/Smyagent`, HEAD `1438f7c`)

SMY Agent is an **already working** AI sales platform by ITcoDe.Uz for a different business (IT services, B2B), deployed to the **same hosting provider** (hostmaster.uz, account for `itcode.uz`, subdomain `agent.itcode.uz`).

| Area | What exists | Quality |
|---|---|---|
| Stack | Python 3.12 · FastAPI · Pydantic v2 · SQLAlchemy 2 + Alembic · MySQL 8 · Jinja2 + HTMX PWA · Passenger via a2wsgi | 767 unit tests; integration tests on MariaDB 10.6/10.11 and MySQL 8.0 in CI; ruff/mypy strict on domain |
| Job queue | DB-backed `jobs` + `job_locks`, idempotent enqueue, atomic claim, retry/backoff, cancel, stale requeue; cron runner `python -m app.jobs.runner --max-jobs 5 --max-seconds 240`, run log `runner_runs`, DB lock against overlap | Matches A2 almost exactly |
| Agent lifecycle | Global + per-module kill switch `ACTIVE/PAUSED/STOPPED`, "stricter wins", checkpoints raise `AgentHaltedError`, outbound jobs cancelled on global STOP | Simpler than A7 (no DRAFT/SCHEDULED/PAUSING/STOPPING/ERROR/DISABLED, no transition table) |
| Auth | Argon2id, server-side sessions with hashed tokens, DB login throttling, CSRF, security headers/CSP, TOTP 2FA with encrypted seeds + recovery codes | Matches A11 |
| Owner Telegram bot | Webhook with secret header, numeric-ID authorization, `/status`, `/stop_all`, approvals | Matches A5 "separate owner bot" |
| Virtual office | `office.js` vanilla Canvas 2D (~27 KB, 572 lines), pure state mapping `app/domain/office.py` (real data only), 30 fps cap, pauses when hidden, reduced-motion | Matches A13 intent (Canvas instead of SVG) |
| Other | Budget/usage accounting, outreach with caps/opt-out, CSV import, OSM discovery provider, backups + verify + restore drill, smoke test, `deploy.sh` run from cPanel Terminal, Uzbek owner guides | Production-grade |

**Hosting facts recorded by Smyagent (`docs/deployment-cpanel.md`, verified 2026-10-25 on hosting1.hostmaster.uz):**
- Setup **Python** App: 3.10–3.13 available. Passenger present. CloudLinux LVE limits active.
- **MySQL 8.0** (client 8.0.44). PostgreSQL server not checked.
- Outbound HTTPS works (Telegram, Google Places, Yandex, 2GIS, OSM, Anthropic, PyPI, GitHub).
- crontab available; minimum interval not checked.
- **`node`/`npm` not found on the shell PATH.** The script did not query the Node.js selector, so "Setup Node.js App" availability is **unknown, not disproven**.
- Memory/CPU/EP limits and request timeout: not checked.

**Open question:** is `unutilmastam.uz` on the **same** cPanel account/plan as `itcode.uz`? If yes, half of our checklist is already answered.

Reuse decision → `DECISIONS.md` D-002.

---

## 6. Hosting facts for this project

| Fact (A2 list) | Status | Source |
|---|---|---|
| Node.js App versions available | ❓ **Unknown — blocker for Node stack** (`node` absent from shell on itcode.uz account) | Smyagent check; owner to confirm |
| MySQL version | ⚠ MySQL 8.0 on the itcode.uz account; unverified for unutilmastam.uz | Smyagent |
| PostgreSQL available | ❓ unknown | — |
| Cron minimum interval | ❓ unknown (need 1 minute) | — |
| Max execution time (Passenger request / cron process) | ❓ unknown | — |
| Memory limit (LVE PMEM) | ❓ unknown | — |
| Outbound HTTPS | ⚠ works on itcode.uz account; `firestore.googleapis.com` / `oauth2.googleapis.com` not tested | Smyagent |
| Python App versions | ✅ 3.10–3.13 on itcode.uz account | Smyagent |

The owner checklist is in `HOSTING_CHECKLIST_UZ.md`. Results will be written back into this table.

---

## 7. Blockers

1. **B1 — Node.js availability unknown.** A2 assumes cPanel "Setup Node.js App". Evidence from the same provider suggests Node may be absent. The stack decision (D-001) cannot be final until the owner answers checklist §1.
2. **B2 — Cron minimum interval unknown.** The queue design needs `* * * * *`. If the plan allows only 5 or 15 minutes, worker time budgets and UX ("agent responds within a minute") change.
3. **B3 — Which cPanel account / domain.** Need confirmation that `agent.unutilmastam.uz` can be created on hostmaster.uz (DNS of `unutilmastam.uz` may point to Firebase Hosting).
4. **B4 (Phase 2, not now) — Firestore read-only service account.** Needs the owner to create it in the Firebase console; instructions will come with Phase 2.

Non-blocking but important: wholesale prices do not exist in the PWA (§2.4); S1–S3 security issues in the live PWA.
