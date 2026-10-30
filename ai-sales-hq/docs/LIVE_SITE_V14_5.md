# Live website (unutilmastam.uz, v14.5) — data model as read by AI Sales HQ

Source: the archive of the code that runs on hostmaster.uz, shared by the owner on 2026-10-29
(`index.html`, `js/0-core.js … js/30-storelink.js`, `upload.php`). The repository root still holds an
older single-file version; it is **not** what runs in production. AI Sales HQ never modifies either.

## Storage

- Firestore project `unutilmastam-27858`, collection `app`, one document per state key.
- Small key: `app/<key> = {v: JSON string, t: ms}`.
- **Large key (new in v14.5):** longer than 300 000 characters → `app/<key> = {c: N, t, len}` and
  `app/<key>__p0 … __p(N-1) = {v: piece, t}`, written in one batch. A reader must join the pieces
  only when every piece has the meta document's `t` (`js/2-sync.js` `tryAssemble`). AI Sales HQ does
  the same (`integrations/firestore.ts` `assembleParts`) and refuses a mixed read instead of guessing.
- Admin-only keys (Firestore rules): `products, stores, categories, deliveryZones, sales, ledger,
  receipts, returns, expenses, adminSettings, sellerInfo`. Other keys (`orders`, `users`,
  `notifications`, `chats`, …) are written by customers too.
- Images and voice messages are now files under `/uploads/<folder>/` (via `upload.php`), not base64.

## Keys used by AI Sales HQ (read-only service account, Cloud Datastore Viewer)

| Key | Fields used | Where |
|---|---|---|
| `products` | `id, name, gram, price, priceStore, stock, category, description, unitType, image` | catalog sync; `priceStore` > 0 = shop ("ulgurji") price shown to approved store owners |
| `categories` | `id, name` | catalog sync |
| `stores` | `id, name, ownerName, phone, address, lat, lng, ownerUserId, needsLocation` | discovery (existing stores), overview |
| `users` | `id, userType ('store'/'customer'), storeStatus ('pending'/'approved'/'rejected'), storeName, name, contact, address, homeLat, homeLng, blocked` | discovery (store owners only; rejected skipped), overview counts |
| `orders` | `storeId, orderType ('dokon'/personal), storeName, total, status ('yangi', 'yetkazildi', 'qaytarildi', …), date` | order history per store, overview |
| `ledger` | `partyType ('store'), partyId, debt` | store debts in the overview |

Not read: `adminSettings`, `chats`, `calls`, `notifications`, `rewards`, `payRequests`, `receipts`,
`expenses`, `couriers`, `promoCodes`. Personal customers are only counted, never imported or listed.

## Observations reported to the owner (not fixed here, D-010)

- `upload.php` checks a shared secret that is also in the public `js/0-core.js`; anyone who reads the
  page source can upload images/audio (up to 16 MB each) to the hosting. A server-side check (e.g. a
  Firebase ID token or a per-session token) would be needed to close this.
- App Check (`APPCHECK_SITE_KEY`) is empty, so the Firestore web API key can be used from outside
  the website; access then depends only on the Firestore rules.
