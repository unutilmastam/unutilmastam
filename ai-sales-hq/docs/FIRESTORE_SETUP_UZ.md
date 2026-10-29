# Saytni ulash: Firestore'dan faqat o'qish uchun kalit (telefondan)

AI Sales HQ mahsulot va narxlarni unutilmastam.uz ilovasining bazasidan (**Firestore**, loyiha `unutilmastam-27858`) **faqat o'qiydi**. Buning uchun Google'da alohida "xizmat hisobi" (service account) yaratiladi va unga **faqat o'qish** huquqi beriladi. Bu hisob bazaga hech narsa yoza olmaydi.

Taxminan 10 daqiqa. Kompyuter shart emas — telefon brauzerida (Chrome/Safari) **"Sayt versiyasi / Desktop site"** rejimini yoqsangiz qulayroq.

---

## 1. Xizmat hisobini yaratish

1. Brauzerda oching: `https://console.cloud.google.com/iam-admin/serviceaccounts?project=unutilmastam-27858`
   (Firebase'ga kirgan Google hisobingiz bilan kiring.)
2. Tepada **"+ CREATE SERVICE ACCOUNT"** ni bosing.
3. **Service account name:** `ai-sales-hq-reader` → **CREATE AND CONTINUE**.
4. **"Grant this service account access to project"** bo'limida **Role** ni tanlang:
   qidiruvga `Cloud Datastore Viewer` yozing va shuni tanlang.
   ⚠️ Boshqa rol (`Editor`, `Owner`, `Firebase Admin`) **tanlamang** — ular yozish huquqini beradi.
5. **CONTINUE** → **DONE**.

## 2. Kalit faylini yuklab olish

1. Ro'yxatda `ai-sales-hq-reader@unutilmastam-27858.iam.gserviceaccount.com` ni bosing.
2. Tepadagi **KEYS** yorlig'i → **ADD KEY** → **Create new key** → **JSON** → **CREATE**.
3. Telefoningizga `unutilmastam-27858-xxxx.json` fayli yuklanadi. **Bu fayl paroldek maxfiy** — hech kimga yubormang, chatga tashlamang.

## 3. Faylni serverga joylash (cPanel)

1. cPanel → **File Manager**.
2. Uy papkangizda (`public_html` **ichida emas!**) `ai-sales-hq-data` nomli papka yarating (**+ Folder**).
3. Shu papkaga kiring → **Upload** → telefondagi JSON faylni tanlang.
4. Yuklangan faylni `firebase-sa.json` deb qayta nomlang (**Rename**).
5. Faylni belgilang → **Permissions** → faqat **Owner: Read, Write** belgilangan bo'lsin (raqam `600`) → **Change Permissions**.
6. Telefoningizdagi nusxani o'chirib tashlang.

## 4. Ilovaga yo'lni ko'rsatish

cPanel → **Setup Node.js App** → AI Sales HQ ilovasi → **Environment variables** → **ADD VARIABLE**:

| Name | Value |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_FILE` | `/home/<cPanel foydalanuvchi nomingiz>/ai-sales-hq-data/firebase-sa.json` |

**SAVE** → **RESTART**.

## 5. Tekshirish

AI Sales HQ → **Integratsiya** sahifasi:

1. Holat **"Sozlangan, hali tekshirilmagan"** bo'lishi kerak.
2. **"Ulanishni tekshirish"** ni bosing → "Ulanish ishlayapti: N ta mahsulot o'qildi" chiqsa — tayyor, holat **"Ulangan"** bo'ladi.
3. **"Hozir sinxronlash"** ni bosing → **Katalog** sahifasida mahsulotlar paydo bo'ladi. Har bir chakana narxni bir marta **"Tasdiqlash"** tugmasi bilan tasdiqlang. Ulgurji narxlarni o'zingiz kiritasiz.

### Xato chiqsa

| Xabar | Sabab | Nima qilish |
|---|---|---|
| `Service account file is world-readable` | Fayl huquqi 600 emas | 3-bo'lim, 5-qadam |
| `Google rejected the service account` | Kalit o'chirilgan yoki fayl buzilgan | 2-bo'limni qaytadan bajaring |
| `Firestore denied access (HTTP 403)` | Rol berilmagan | 1-bo'lim, 4-qadam: `Cloud Datastore Viewer` |
| `Document app/products not found` | Loyiha nomi boshqa | Faylning ichidagi `project_id` = `unutilmastam-27858` ekanini tekshiring |

Kalitni bekor qilish kerak bo'lsa: 2-bo'limdagi **KEYS** yorlig'ida kalitning yonidagi 🗑 belgisi. Shundan keyin sinxronlash darhol to'xtaydi.
