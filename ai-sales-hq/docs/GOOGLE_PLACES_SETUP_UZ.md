# Google Places kaliti (ixtiyoriy) — telefondan

"Bozor tadqiqotchisi" agenti Surxondaryodagi supermarket va do'konlarni **Google'ning rasmiy Places API** orqali qidiradi. Bu pullik xizmat: har bir qidiruv taxminan **0,032 $** turadi. Ilovada kunlik limit bor (standart: kuniga 50 ta so'rov ≈ 1,6 $), uni **Mijoz qidirish** sahifasida o'zgartirasiz.

Kalit bo'lmasa ham ilova ishlaydi: mavjud do'konlar ro'yxati, qo'lda kiritish va CSV import ishlayveradi.

> Telefon brauzerida **"Desktop site / Sayt versiyasi"** rejimini yoqing — Google Cloud konsoli shunda qulayroq.

## 1. Loyiha va to'lov

1. Oching: `https://console.cloud.google.com/` (Firebase'dagi Google hisobingiz bilan).
2. Tepadagi loyiha tanlovidan `unutilmastam-27858` ni tanlang (yoki yangi loyiha yarating).
3. **Billing** bo'limida to'lov kartasi ulangan bo'lishi kerak (Google har oy bepul limit beradi).
4. Xavfsizlik uchun: **Billing → Budgets & alerts → Create budget** — masalan oyiga 20 $ va 50 % / 90 % / 100 % da email ogohlantirish.

## 2. Places API'ni yoqish

1. Oching: `https://console.cloud.google.com/apis/library/places.googleapis.com`
2. **ENABLE** tugmasini bosing. (Diqqat: nomi **"Places API (New)"** bo'lishi kerak.)

## 3. Kalit yaratish va cheklash

1. **APIs & Services → Credentials → + CREATE CREDENTIALS → API key**.
2. Kalit yaratilgach **EDIT API KEY** (yoki kalit nomini bosing):
   - **API restrictions → Restrict key** → faqat **Places API (New)** ni belgilang.
   - **Application restrictions → IP addresses** → hostingingizning IP manzilini kiriting (cPanel bosh sahifasida o'ngda **"Shared IP Address"** yozilgan).
3. **SAVE**. Kalitni nusxa oling (`AIza...` bilan boshlanadi). Bu kalit **maxfiy** — hech kimga yubormang.

## 4. Ilovaga qo'shish

cPanel → **Setup Node.js App** → AI Sales HQ → **Environment variables** → **ADD VARIABLE**:

| Name | Value |
|---|---|
| `GOOGLE_PLACES_API_KEY` | nusxa olgan kalit |

**SAVE** → **RESTART**.

## 5. Tekshirish

AI Sales HQ → **Ko'proq → Mijoz qidirish**:

1. "Google Places" kartasida **"Sozlangan"** chiqadi.
2. Qidiruv so'zi (masalan `supermarket`) va tumanni tanlab **"Hozir qidirish"** ni bosing → "Topildi: N" chiqsa, holat **"Ulangan"** bo'ladi.
3. Avtomatik qidiruv uchun **Agentlar** sahifasida **Bozor tadqiqotchisi** va **Biznes tahlilchi**ni faollashtirib ishga tushiring. Agent ish vaqtida kuniga belgilangan limitgacha qidiradi.

| Xabar | Sabab |
|---|---|
| `HTTP 403 ... not authorized` | Places API (New) yoqilmagan yoki kalit boshqa API'ga cheklangan |
| `HTTP 403 ... IP address` | Kalitdagi IP cheklovi hosting IP'siga mos emas |
| `Bugungi Google Places limiti tugadi` | Kunlik limitga yetildi — ertaga davom etadi |
