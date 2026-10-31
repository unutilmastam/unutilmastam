# AI Sales HQ ni hostingga o'rnatish — telefondan, cPanel (hostmaster.uz)

Agent `agent.unutilmastam.uz` manzilida ishlaydi. Sayt (`unutilmastam.uz`, `public_html`) ga **tegilmaydi**: agent o'z papkasida, o'z bazasida ishlaydi va saytdan faqat o'qiydi.

Kompyuter, Terminal va `npm install` kerak emas. GitHub tayyor paketni o'zi yig'adi (`ai-sales-hq-release` branchi), siz cPanel'da faqat tugma bosasiz. Birinchi o'rnatish taxminan 30 daqiqa.

> Telefonda cPanel menyusi yashirin bo'lsa — yuqori chapdagi **☰**. Har bir bo'limni yuqoridagi **Search** ga nomini yozib topsa bo'ladi.
> **Parol, kalit va `hq.env` ichidagi narsalarni hech kimga (Claude'ga ham) yubormang.**

Hostingda tekshirilgan (2026-10-29, ega skrinshotlari): Node.js 22.22.0 bor, cron har 1 daqiqada ishlaydi, MySQL 8.0.44, subdomen yaratish mumkin. Git Version Control bor (2026-10-30). Hali tekshirilmagan: `mysqldump` — biror qadamda xato chiqsa, xabarni menga yozing.

---

## 1. Subdomen va SSL

1. **Domains** → **Create A New Domain**.
2. Domain: `agent.unutilmastam.uz`. **"Share document root"** belgisini **olib tashlang**. **Submit**.
3. **SSL/TLS Status** → `agent.unutilmastam.uz` ni belgilang → **Run AutoSSL**. Bir necha daqiqada yashil qulf chiqadi.

## 2. Ma'lumotlar bazasi

1. **MySQL® Database Wizard**.
2. Baza nomi: `hq` → **Next Step**. To'liq nomi ko'rinadi (masalan `unutilma_hq`) — yozib qo'ying.
3. Foydalanuvchi: `hq`, parol: **Password Generator** → **Use Password** (parolni nusxa olib qo'ying) → **Create User**. To'liq nomi (masalan `unutilma_hq`) — yozib qo'ying.
4. **ALL PRIVILEGES** → **Next Step**.

## 3. Node.js ilova

1. **Setup Node.js App** → **+ CREATE APPLICATION**.
2. To'ldiring:
   - **Node.js version:** `22.22.0` (ro'yxatda "recommended" deb 20.20.0 turgan bo'lsa ham, 22.22.0 ni tanlang — ilova shu versiyada sinovdan o'tgan)
   - **Application mode:** `Production`
   - **Application root:** `ai-sales-hq-app`
   - **Application URL:** `agent.unutilmastam.uz`
   - **Application startup file:** `apps/api/dist/server.js`
3. **CREATE**. **"Run NPM Install" ni bosmang** — kerak emas. Environment variables ham kerak emas.

## 4. Kodni GitHub'dan olish

1. **Git™ Version Control** → **Create**.
2. **Clone a Repository:** yoqilgan. **Clone URL:** `https://github.com/unutilmastam/unutilmastam.git`
3. **Repository Path:** `repositories/ai-sales-hq` · **Repository Name:** `ai-sales-hq` → **Create**. Bir-ikki daqiqa kuting.
4. Ro'yxatda **Manage** → **Basic Information** → **Checked-Out Branch:** `ai-sales-hq-release` → **Update**.

## 5. Birinchi deploy — sozlamalar fayli

1. Shu sahifada **Pull or Deploy** yorlig'i → **Deploy HEAD Commit**.
2. Birinchi marta deploy ataylab to'xtaydi va maxfiy kalitlar bilan **`ai-sales-hq-data/hq.env`** faylini yaratadi.
3. **File Manager** → uy papkasi → `ai-sales-hq-data` → `hq.env` → **Edit**. Faqat shu uch qatorni to'ldiring (2-bo'limdagi to'liq nomlar):
   ```
   DB_NAME=unutilma_hq
   DB_USER=unutilma_hq
   DB_PASSWORD="parol shu yerda, qo'shtirnoq ichida"
   ```
   Boshqa qatorlarga tegmang. **Save Changes**.

## 6. Ikkinchi deploy — ishga tushirish

1. **Git™ Version Control** → **Manage** → **Pull or Deploy** → **Deploy HEAD Commit**.
2. Deploy quyidagilarni o'zi bajaradi: sozlamalarni tekshiradi → bazaning zaxira nusxasini oladi → migratsiyalarni qo'llaydi → fayllarni `ai-sales-hq-app` ga ko'chiradi → qayta ishga tushiradi → `https://agent.unutilmastam.uz/api/v1/ready` ni tekshiradi.
3. **Setup Node.js App** → ilova yonida **RESTART** ni bir marta bosing.
4. Brauzerda: `https://agent.unutilmastam.uz/api/v1/ready` → `{"status":"ready","database":"ok"}` chiqsa — tayyor.

**Deploy natijasi:** cPanel'dagi "in progress" aylanib turgan belgisiga qaramang — deploy xato bilan tugasa ham u to'xtamaydi. Deploy 10–60 soniyada tugaydi. Natija har safar **File Manager → `ai-sales-hq-data` → `deploy-natija.txt`** fayliga o'zbekcha yoziladi: oxirida `TAYYOR` — hammasi joyida; `XATO: ... qadamida to'xtadi` — faylning hammasini skrinshot qilib menga yuboring (unda parol yo'q). Xato bo'lsa, ishlab turgan ilovaga tegilmaydi.

## 7. Egani yaratish (bir marta)

1. `https://agent.unutilmastam.uz/setup` ni oching.
2. **Sozlash kodi:** `hq.env` dagi `SETUP_TOKEN=` qatoridan keyingi matn.
3. Login, ism, kuchli parol → keyin Google Authenticator bilan **2FA** ni yoqing va 10 ta tiklash kodini saqlab qo'ying.
4. Ega yaratilgandan keyin sozlash sahifasi o'zi yopiladi.

## 8. Cron (fon ishlari va zaxira)

**Cron Jobs** → **Add New Cron Job**. Har biri uchun **Command** ga nusxa oling:

| Nima | Vaqt | Command |
|---|---|---|
| Agentlar ishi | **Once Per Minute** (`* * * * *`) | `/bin/bash $HOME/ai-sales-hq-app/deploy/cron-worker.sh >/dev/null 2>&1` |
| Kunlik zaxira | Minute `15`, Hour `22`, qolgani `*` | `/bin/bash $HOME/ai-sales-hq-app/deploy/backup.sh daily >/dev/null 2>&1` |

- Server vaqti odatda UTC: `22:15` UTC = Toshkent bo'yicha **03:15**. Cron sahifasining tepasida server vaqti yozilgan bo'lsa, shunga moslang.
- Eng kichik interval 1 daqiqa bo'lmasa (masalan 5 daqiqa), shuni tanlang — agentlar sekinroq ishlaydi, lekin ishlaydi.
- Ilovada **Agentlar** sahifasida "Cron ishlayapti" yashil bo'lsa — hammasi joyida.

## 9. Saytga, AI'ga va Telegram'ga ulash

- **Sayt (Firestore):** `docs/FIRESTORE_SETUP_UZ.md` — kalit faylini `ai-sales-hq-data/firebase-sa.json` qilib yuklang. Keyin `hq.env` da `# FIREBASE_SERVICE_ACCOUNT_FILE=...` qatorining boshidagi `#` ni olib tashlang. So'ng **Setup Node.js App → RESTART**.
- **AI (Claude):** ilovaning o'zida — **Ko'proq → Integratsiya → AI provayder** (`docs/AI_SETUP_UZ.md`).
- **Telegram bot (ixtiyoriy):** `hq.env` dagi `TELEGRAM_...` qatorlari, keyin RESTART.

---

## Yangilash (har safar men yangi versiya chiqarganimda)

1. **Git™ Version Control** → **Manage** → **Pull or Deploy**.
2. **Update from Remote** → **Deploy HEAD Commit**.

Deploy har safar avval zaxira nusxa oladi va oldingi versiyani `ai-sales-hq-previous` ga saqlaydi.

## Zaxira nusxalar

- Papka: `ai-sales-hq-backups` (`public_html` dan tashqarida). Har kuni bitta nusxa va har deploydan oldin bitta. 14 kundan eskilari o'zi o'chadi.
- Haftada bir marta eng yangi `.sql.gz` faylni **File Manager → Download** bilan telefoningizga yoki Google Drive'ga saqlab qo'ying — hosting buzilsa ham ma'lumot qoladi.
- Tiklash: cPanel **Terminal** bo'lsa — `bash ~/ai-sales-hq-app/deploy/restore.sh ~/ai-sales-hq-backups/<fayl>`. U `HA` deb yozishingizni so'raydi. Terminal bo'lmasa — menga yozing, birga qilamiz.

## Muammo bo'lsa

| Belgi | Nima qilish |
|---|---|
| Sahifa ochilmaydi / 503 | **Setup Node.js App → RESTART**. Keyin `ai-sales-hq-app` papkasidagi `stderr.log` (bo'lsa) faylining oxirini menga yuboring |
| Deploy logida `Node.js topilmadi` yoki `Node ... eski` | 3-bo'lim: ilova nomi aynan `ai-sales-hq-app`, versiya 22 yoki 20.19+ bo'lsin |
| `Invalid configuration: DATABASE_URL` | `hq.env` dagi `DB_NAME`, `DB_USER`, `DB_PASSWORD` ni tekshiring |
| `connect ECONNREFUSED` | `hq.env` da `# DB_SOCKET=...` qatorining boshidagi `#` ni olib tashlang va qayta Deploy qiling |
| `Access denied for user` | Parol yoki foydalanuvchi noto'g'ri, yoki 2-bo'lim 4-qadamdagi ruxsat berilmagan |
| Agentlar sahifasida "Cron ishlamayapti" | 8-bo'limdagi birinchi cron qatorini tekshiring. Log: `ai-sales-hq-data/logs/worker.log` |
| Yangi versiyadan keyin nimadir buzildi | Terminal bo'lsa: `bash ~/ai-sales-hq-app/deploy/rollback.sh`. Aks holda menga yozing — eski versiyani GitHub orqali qaytaraman |
