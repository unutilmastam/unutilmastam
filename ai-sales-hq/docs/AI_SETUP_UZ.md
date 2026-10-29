# AI (Claude) kalitini ulash — ixtiyoriy, telefondan

AI faqat **xabar matnini yozishga** yordam beradi: do'konga birinchi taklif va mijoz javobiga javob loyihasi. Narx, chegirma va shartlarni **kod tekshiradi**, xabarni esa **siz o'qib, o'zingiz yuborasiz**. AI ulanmagan bo'lsa ham hammasi ishlaydi — loyihalar tayyor shablon asosida yoziladi.

Narx (taxminan): bitta xabar loyihasi ~0,0002 $ (arzon model). Ilovada kunlik byudjet bor (standart 1 $/kun), **Murojaatlar → Murojaat sozlamalari** da o'zgartirasiz. Byudjet tugasa "Muloqot mutaxassisi" agenti ertagacha pauzaga o'tadi.

## 1. Kalit olish

1. Brauzerda oching: `https://platform.claude.com/` → ro'yxatdan o'ting (email bilan).
2. **Billing** — kartani ulang va oz miqdorda (masalan 5 $) balans to'ldiring. Xavfsizlik uchun **Limits** bo'limida oylik limit qo'ying (masalan 10 $).
3. **API Keys → Create Key** → nom: `ai-sales-hq` → **Create**.
4. `sk-ant-...` bilan boshlanadigan kalitni nusxa oling. Bu kalit **maxfiy** — hech kimga yubormang, chatga tashlamang.

## 2. Ilovaga qo'shish

cPanel → **Setup Node.js App** → AI Sales HQ → **Environment variables** → **ADD VARIABLE**:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | nusxa olgan kalit |

**SAVE** → **RESTART**.

(Ixtiyoriy: `AI_MODEL` — standart `claude-haiku-5-5`, arzon; `AI_MODEL_STRONG` — standart `claude-opus-5-5`, faqat "Kuchliroq model bilan" tugmasini bosganingizda ishlatiladi.)

## 3. Tekshirish

1. **Ko'proq → Integratsiya → AI provayder (Claude)**: holat **"Sozlangan"**.
2. **Ulanishni tekshirish** → "Ulanish ishlayapti" chiqsa, holat **"Ulangan"** bo'ladi.
3. Saralangan mijoz sahifasida **"Xabar loyihasini tayyorlash"** → loyiha ostida "AI: claude-haiku-5-5" yozuvi chiqadi.

| Xabar | Sabab |
|---|---|
| `401` / `authentication_error` | Kalit noto'g'ri yoki o'chirilgan |
| `credit balance is too low` | Balansni to'ldiring |
| "Bugungi AI byudjeti tugadi" | Kunlik byudjet tugadi — ertaga davom etadi yoki byudjetni oshiring |
