# AI (Claude) kalitini ulash — ixtiyoriy, telefondan

AI faqat **xabar matnini yozishga** yordam beradi: do'konga birinchi taklif va mijoz javobiga javob loyihasi. Narx, chegirma va shartlarni **kod tekshiradi**, xabarni esa **siz o'qib, o'zingiz yuborasiz**. AI ulanmagan bo'lsa ham hammasi ishlaydi — loyihalar tayyor shablon asosida yoziladi.

Narx (taxminan): bitta xabar loyihasi ~0,0002 $ (arzon model). Ilovada kunlik byudjet bor (standart 1 $/kun), **Murojaatlar → Murojaat sozlamalari** da o'zgartirasiz. Byudjet tugasa "Muloqot mutaxassisi" agenti ertagacha pauzaga o'tadi.

## 1. Kalit olish

1. Brauzerda oching: `https://platform.claude.com/` → ro'yxatdan o'ting (email bilan).
2. **Billing** — kartani ulang va oz miqdorda (masalan 5 $) balans to'ldiring. Xavfsizlik uchun **Limits** bo'limida oylik limit qo'ying (masalan 10 $).
3. **API Keys → Create Key** → nom: `ai-sales-hq` → **Create**.
4. `sk-ant-...` bilan boshlanadigan kalitni nusxa oling. Bu kalit **maxfiy** — hech kimga yubormang, chatga tashlamang.

## 2. Ilovaga qo'shish (hosting sozlamalari kerak emas)

1. Ilovani oching → **Ko'proq → Integratsiya → AI provayder (Claude)**.
2. **Anthropic API kaliti** maydoniga nusxa olgan kalitni qo'ying.
3. Modellarni o'zgartirmasangiz ham bo'ladi: asosiy — `claude-haiku-5-5` (arzon), kuchli — `claude-opus-5-5` (faqat "Kuchliroq model bilan" tugmasini bosganingizda).
4. **Tekshirish va saqlash** ni bosing. Ilova kalitni darhol haqiqiy so'rov bilan tekshiradi:
   - ishlasa — "Kalit ishlayapti va saqlandi", holat **"Ulangan"**;
   - ishlamasa — xato ko'rsatiladi va **hech narsa saqlanmaydi** (eski kalit bo'lsa, o'shasi qoladi).

Kalit shifrlangan holda saqlanadi, ekranda faqat oxirgi 4 belgisi (`••••abcd`) ko'rinadi. Qayta ishga tushirish (restart) kerak emas.

Keyinroq: **Kalit yoki modelni o'zgartirish** — yangi kalit yoki boshqa model; **Kalitni o'chirish** — AI o'chadi, xabarlar yana shablon asosida tayyorlanadi.

## 3. Tekshirish

1. **Ko'proq → Integratsiya → AI provayder (Claude)**: holat **"Ulangan"**.
2. Istalgan vaqtda **Ulanishni tekshirish** → "Ulanish ishlayapti".
3. Saralangan mijoz sahifasida **"Xabar loyihasini tayyorlash"** → loyiha ostida "AI: claude-haiku-5-5" yozuvi chiqadi.

| Xabar | Sabab |
|---|---|
| `401` / `authentication_error` | Kalit noto'g'ri yoki o'chirilgan |
| `credit balance is too low` | Balansni to'ldiring |
| "Saqlangan kalitni o'qib bo'lmadi" | Server maxfiy kaliti (`APP_SECRET_KEY`) o'zgargan — kalitni qayta kiriting |
| "Bugungi AI byudjeti tugadi" | Kunlik byudjet tugadi — ertaga davom etadi yoki byudjetni oshiring |
