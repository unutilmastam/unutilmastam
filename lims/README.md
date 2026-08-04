# LabCore — laboratoriya boshqaruv tizimi (LIMS)

Laboratoriya **o'z serverida** ishlaydigan tizim: bemor kartalari, analiz natijalari,
xodimlar nazorati, audit jurnali va 100 yillik arxiv. Internet o'chsa ham laboratoriya
to'liq ishlaydi — barcha ma'lumot bino ichida qoladi.

```
   Laborant kompyuteri ─┐
   Shifokor kompyuteri ─┼─ lokal tarmoq ─→ Laboratoriya serveri
   Kassa kompyuteri   ─┘                    ├─ LabCore (Node.js)
                                            ├─ PostgreSQL (ma'lumotlar)
                                            └─ /var/lib/labcore (PDF, rasm, rentgen)
                                                       │
                                                 kunlik zaxira → tashqi disk / server
```

Tizim uch qismdan iborat:

| Qism | Kim uchun | Nima bilan |
|---|---|---|
| **Server** | laboratoriya binosi | Node.js + PostgreSQL, `lims/` |
| **Windows dastur** | laborant, shifokor, kassa kompyuterlari | Electron, `lims/desktop/` — o'rnatuvchi `.exe` |
| **Mobil nazorat ilovasi** | laboratoriya egasi | PWA — telefonga o'rnatiladi, `#/mobile` |

Uchalasi bitta serverga va bitta bazaga ishlaydi. Xohlasangiz ish stansiyalari
oddiy brauzerdan ham kira oladi — dastur majburiy emas, lekin u kompyuterning
haqiqiy nomini auditga yozadi.

---

## 1. Nima qila oladi

| Bo'lim | Imkoniyat |
|---|---|
| **Bemor kartasi** | ID (karta raqami), F.I.O., tug'ilgan sana, jins, telefon, manzil, pasport; QR kod |
| **Tibbiy tarix** | Murojaatlar, shikoyat, analizlar, natijalar, tashxis, dori, muolaja — yillar bo'yicha lenta |
| **Analizlar** | Katalog, narx, norma oraliqlari (jins/yosh bo'yicha), probirka shtrix-kodi, muddat nazorati |
| **Natijalar** | Kiritish, avtomatik baholash (past/yuqori/kritik), tasdiqlash, chop etiladigan blanka |
| **Audit** | Kim, qachon, qaysi kompyuterdan, **eski qiymat → yangi qiymat** |
| **Ish nazorati** | Kim qachon kirdi, qaysi bemorni ochdi, nima o'zgartirdi, necha soat ishladi |
| **Kassa** | To'lov, chek, qaytarish, qarzdorlar, moliyaviy hisobot |
| **Fayl arxivi** | `/Patients/<karta>_<F.I.O.>/<yil>/` papkalari, SHA-256 nazorati |
| **Bildirishnoma** | SMS / Telegram navbati: "natija tayyor", kritik ko'rsatkich ogohlantirishi |
| **Ombor** | Reaktivlar, qoldiq, yaroqlilik muddati ogohlantirishi |
| **Dashboard** | Bugungi bemorlar, analizlar, onlayn xodimlar, daromad, KPI |

---

## 2. Rollar va ruxsatlar

| Amal | Administrator | Laborant | Shifokor | Kassir |
|---|:--:|:--:|:--:|:--:|
| Bemor qo'shish | ✅ | ✅ | ✅ | ❌ |
| Analiz buyurtmasi | ✅ | ✅ | ✅ | ❌ |
| Natija kiritish / tasdiqlash | ✅ | ✅ | tasdiqlash | ❌ |
| Tashxis yozish | ✅ | ❌ | ✅ | ❌ |
| To'lov qabul qilish | ✅ | ❌ | ❌ | ✅ |
| Xodimlarni boshqarish | ✅ | ❌ | ❌ | ❌ |
| Audit va ish nazorati | ✅ | ❌ | ❌ | ❌ |
| Moliyaviy hisobot | ✅ | ❌ | ❌ | ✅ (kassa) |
| Eski yozuvni tuzatish | ✅ | ❌* | ❌* | ❌ |

\* Laborant/shifokor **o'zi kiritgan** yozuvni faqat `EDIT_WINDOW_HOURS` (odatda 24 soat)
ichida tuzata oladi. Tasdiqlangan natija esa faqat administrator orqali ochiladi —
har bir bunday o'zgarish auditga tushadi.

---

## 3. O'rnatish (Ubuntu/Debian laboratoriya serveri)

```bash
# 1) Zarur dasturlar
sudo apt update
sudo apt install -y postgresql nodejs npm

# 2) Baza va foydalanuvchi
sudo -u postgres psql -c "CREATE USER labcore WITH PASSWORD 'kuchli-parol';"
sudo -u postgres psql -c "CREATE DATABASE labcore OWNER labcore;"

# 3) Dastur
sudo mkdir -p /opt/labcore && sudo chown $USER /opt/labcore
cp -r lims/* /opt/labcore/ && cd /opt/labcore
npm ci --omit=dev

# 4) Sozlamalar
cp .env.example .env
chmod 600 .env
# .env ni tahrirlang: DATABASE_URL, DATA_DIR, JWT_SECRET (openssl rand -hex 48)

# 5) Sxema va boshlang'ich ma'lumotlar
npm run migrate
npm run seed          # administrator + 19 ta standart analiz katalogi

# 6) Xizmat sifatida ishga tushirish
sudo useradd -r -s /usr/sbin/nologin labcore || true
sudo mkdir -p /var/lib/labcore && sudo chown labcore /var/lib/labcore
sudo cp deploy/labcore.service /etc/systemd/system/
sudo systemctl enable --now labcore
```

Tekshirish: `curl http://localhost:4000/api/health` → `{"ok":true,"db":"up"}`

Birinchi kirish: `npm run seed` bergan login/parol (odatda `admin` / `Admin12345`).
**Birinchi kirishdayoq parolni almashtiring** va Sozlamalar bo'limida ikki bosqichli
loginni yoqing.

### Ish stansiyalarini ulash (Windows dastur)

1. Serverga statik IP bering (masalan `192.168.1.10`).
2. Windows uchun o'rnatuvchi yasang (batafsil: `desktop/README.md`):
   ```powershell
   cd lims\desktop
   npm install
   npm run build:win        # dist\LabCore Setup 1.0.0.exe
   ```
3. `.exe` ni har bir ish stansiyasiga o'rnating. Birinchi ochilishda dastur
   server manzilini so'raydi va "Ulanishni tekshirish" tugmasi bilan aloqani
   sinab ko'radi.
4. Kompyuter nomi Windows tizimidan avtomatik olinadi (`LAB-PC-02`) va audit
   jurnaliga shu nom bilan yoziladi — xodim uni o'zgartira olmaydi.

Dastur o'rnatilmasa ham bo'ladi: brauzerda `http://192.168.1.10:4000` ni ochib,
**Sozlamalar → Ish stansiyasi** bo'limida kompyuter nomini qo'lda kiritish kerak.

HTTPS uchun: `deploy/nginx.conf.example` ga qarang.

### Mobil nazorat ilovasi (rahbar uchun)

Telefonda serverni oching (`http://192.168.1.10:4000` yoki VPN orqali) va
brauzer menyusidan **"Bosh ekranga qo'shish"** ni tanlang — ilova alohida
belgicha bilan o'rnatiladi, brauzer paneli ko'rinmaydi.

Ilovada:

* bugungi bemorlar, analizlar, tasdiqlangan natijalar, daromad;
* hozir ishlayotgan xodimlar — kim, qaysi kompyuterda, oxirgi faollik vaqti;
* kritik natijalar ro'yxati (bosilsa buyurtma ochiladi);
* so'nggi o'zgarishlar lentasi (kim nimani o'zgartirdi);
* har 30 soniyada avtomatik yangilanadi.

Aloqa uzilsa ilova baribir ochiladi va oxirgi ko'rsatkichlarni
"⚠️ Aloqa yo'q — oxirgi saqlangan ma'lumot" belgisi bilan ko'rsatadi.
Bemor kartalari va hujjatlar telefonda keshda saqlanmaydi.

---

## 4. Audit — tizimning yuragi

Har bir muhim amal `audit_log` jadvaliga yoziladi va **hech qachon
o'zgartirilmaydi**: baza darajasidagi trigger `UPDATE` va `DELETE` ni bloklaydi.
Server kodida xato bo'lsa ham audit yozuvini yashirib bo'lmaydi.

Misol — natija tuzatilganda saqlanadigan yozuv:

```
Vaqt        : 04.08.2026 14:20
Xodim       : Dilnoza Karimova (laborant)
Kompyuter   : LAB-PC-02          IP: 192.168.1.24
Amal        : O'zgartirdi (result)
Bemor       : Karimov Anvar (karta 100025)
Tafsilot    : Natija o'zgartirildi — Gemoglobin: 110 → 130
Eski qiymat : { "value": 110, "flag": "low" }
Yangi qiymat: { "value": 130, "flag": "normal" }
```

Qayd etiladigan amallar: `LOGIN`, `LOGIN_FAILED`, `LOGOUT`, `VIEW` (kim qaysi bemorni
ochdi), `SEARCH`, `CREATE`, `UPDATE`, `DELETE`, `CONFIRM`, `PRINT`, `PAYMENT`,
`UPLOAD`, `DOWNLOAD`, `ACCESS_DENIED`.

**Ish nazorati** bo'limida har bir sessiya bo'yicha kunlik lenta ko'rinadi:

```
04.08.2026 — Dilnoza (LAB-PC-02)
  09:15  Bemor kartasini ochdi: Karimov Anvar
  09:18  Natija kiritildi — Gemoglobin: 110
  09:30  Natija o'zgartirildi — Gemoglobin: 110 → 130
```

---

## 5. Fayl arxivi

```
/var/lib/labcore/Patients/
  100025_Karimov_Anvar/
    2026/
      Qon_tahlili.pdf
      Rentgen.jpg
    2027/
      Yangi_analiz.pdf
```

* Fayl nomi to'qnashsa ustiga yozilmaydi — raqam qo'shiladi (`Natija_1.pdf`).
* Har bir fayl uchun **SHA-256** saqlanadi; `Fayllar → Tekshirish` orqali
  yillar o'tib ham fayl buzilmaganini tasdiqlash mumkin.
* "O'chirish" — bu faqat ro'yxatdan olish: fayl diskda qoladi, kim o'chirgani auditda.

---

## 6. Zaxira nusxa (100 yil saqlash uchun eng muhim qism)

```bash
./scripts/backup.sh                      # baza + fayllar + nazorat summalari
BACKUP_DIR=/mnt/nas/labcore ./scripts/backup.sh
```

Avtomatik kunlik zaxira:

```bash
sudo cp deploy/labcore-backup.service deploy/labcore-backup.timer /etc/systemd/system/
sudo systemctl enable --now labcore-backup.timer
```

Tiklash:

```bash
pg_restore --clean --if-exists --dbname="$DATABASE_URL" backups/2026-08-04_0130/labcore.dump
tar -xzf backups/2026-08-04_0130/patients-files.tar.gz -C /var/lib/labcore
```

**Uch nusxa qoidasi:** server diskida + tashqi diskda + boshqa binoda
(`RSYNC_TARGET` sozlamasi). Zaxirani yiliga kamida bir marta haqiqiy tiklab ko'ring —
tekshirilmagan zaxira zaxira emas.

Shuningdek kerak: **UPS** (elektr o'chishiga qarshi), disk uchun RAID, server
xonasiga cheklangan kirish.

---

## 7. Xavfsizlik

* Parollar `bcrypt` (12 rounds) bilan saqlanadi — ochiq matnda hech qayerda yo'q.
* Sessiya bazada saqlanadi: administrator xodimning sessiyasini bir tugma bilan uzadi.
* Ikki bosqichli login (TOTP — Google/Microsoft Authenticator).
* 5 marta xato parol → hisob 15 daqiqaga bloklanadi (sozlanadi).
* Rol tekshiruvi har bir so'rovda; ruxsatsiz urinish auditga `ACCESS_DENIED` bo'lib tushadi.
* Kassir bemorning pasport ma'lumotini ko'rmaydi.
* Fayl yuklashda tur va hajm cheklovi; yuklab olish faqat avtorizatsiya bilan.
* Tizimni **internetga to'g'ridan-to'g'ri ochmang**. Masofadan kirish kerak bo'lsa
  faqat VPN orqali.

---

## 8. Buyruqlar

| Buyruq | Vazifasi |
|---|---|
| `npm start` | Serverni ishga tushirish |
| `npm run dev` | Ishlab chiqish rejimi (avtomatik qayta yuklash) |
| `npm run migrate` | Sxemani o'rnatish/yangilash |
| `npm run seed` | Administrator + standart analiz katalogi |
| `npm run create-admin <login> [parol]` | Administrator yaratish yoki parolini tiklash |
| `npm test` | Uchdan-uchgacha testlar (alohida test bazasi kerak) |
| `./scripts/backup.sh` | Zaxira nusxa |

Testlar uchun:

```bash
sudo -u postgres createdb -O labcore labcore_test
TEST_DATABASE_URL=postgres://labcore:parol@127.0.0.1:5432/labcore_test npm test
```

---

## 9. API (qisqacha)

Barcha manzillar `/api` bilan boshlanadi; avtorizatsiya `Authorization: Bearer <token>`
yoki `httpOnly` cookie orqali. Ish stansiyasi nomi `X-Computer-Name` sarlavhasida.

| Manzil | Tavsif |
|---|---|
| `POST /auth/login` `/logout` `/change-password` `/2fa/*` | Kirish va himoya |
| `GET/POST/PATCH /patients` `/patients/:id/history` `/patients/:id/audit` | Bemorlar |
| `POST /visits` `/visits/diagnoses` `GET /visits/doctor-queue` | Murojaat va tashxis |
| `GET/POST /orders` `POST /orders/:id/results` `/confirm` `GET /orders/:id/report` | Analizlar |
| `GET/POST /files/patient/:id` `GET /files/:id/download` `/verify` | Fayl arxivi |
| `GET/POST /payments` `/payments/:id/refund` `/receipt` `/debts` | Kassa |
| `GET /monitoring/audit` `/sessions` `/online` `/staff/:id/day` | Nazorat (admin) |
| `GET /dashboard` `/dashboard/finance` `/dashboard/stats` | Hisobotlar |
| `GET /labels/barcode/:code` `/qr/patient/:id` `/scan/:barcode` | Shtrix-kod va QR |
| `GET/POST /inventory` `/inventory/:id/move` | Ombor |

---

## 10. Texnik tafsilotlar

* **Backend:** Node.js 20+, Express 5, PostgreSQL 14+ (`pg`).
* **Frontend:** tashqi kutubxonasiz ES-modullar — internetsiz ham to'liq ishlaydi
  (CDN, tashqi shrift yo'q).
* **Windows dastur:** Electron 33 (`desktop/`), `contextIsolation: true`,
  `nodeIntegration: false`; o'rnatuvchi — electron-builder/NSIS.
* **Mobil ilova:** PWA (manifest + service worker). Ko'rsatkichlar
  "avval tarmoq, uzilsa kesh" tamoyilida; tibbiy hujjatlar keshlanmaydi.
* **Arxiv uchun:** vaqtlar `timestamptz`, katta jadvallarda BRIN indekslar,
  qidiruv uchun `pg_trgm` (bo'lmasa avtomatik `ILIKE` rejimi).
* **Avtomatik tahlil** (`src/services/analyzer.js`) — qoidalarga asoslangan:
  bemorning jinsi va yoshiga mos norma oralig'i bilan solishtiradi, kritik
  qiymatlarni ajratadi va xulosa matnini tayyorlaydi. Tashqi AI xizmatiga
  ulanmaydi: tibbiy ma'lumot binodan chiqmaydi. Xulosa shifokor qarorining
  o'rnini bosmaydi.

### Hozircha bajarilmagan (keyingi bosqichlar)

Quyidagilar arxitekturada hisobga olingan, lekin hali yozilmagan:

* **Kameralar** — `cameras` jadvali va API bor, video ko'rish interfeysi yo'q
  (odatda kamera tizimi alohida NVR bilan ishlaydi).
* **Uskunalardan avtomatik natija olish** — HL7/ASTM interfeysi; `results.device`
  maydoni shu maqsad uchun tayyor.
* **Telegram bot** — xabar navbati va yuborish adapteri tayyor
  (`TELEGRAM_BOT_TOKEN` sozlansa ishlaydi), lekin bemorni botga ulash oqimi
  (`patient_contacts.telegram_chat_id`) qo'lda to'ldiriladi.
* **Push-bildirishnoma** — mobil ilovaga telefon qulflangan holatda
  ogohlantirish yuborish (hozircha ilova ochilganda ko'rsatiladi).
* **Tayyor `.exe`** — o'rnatuvchi Windows yoki `wine` o'rnatilgan kompyuterda
  bitta buyruq bilan yasaladi (`npm run build:win`); repozitoriyda binar fayl
  saqlanmaydi.
* **SMS shlyuzi** — `SMS_GATEWAY_URL` sizning provayderingiz formatiga moslanishi kerak.
