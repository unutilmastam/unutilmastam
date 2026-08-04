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
| **Uskunalar** | Analizatorlardan avtomatik natija: HL7, ASTM, papka yoki HTTP |
| **Kameralar** | Jonli kadr, yuz tanish hodisalari, ish joyida bo'lgan vaqt (davomat) |
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

## 4. Printer va laboratoriya uskunalari

### Printer — hozir ishlaydi

Natija blankasi, chek va shtrix-kod yorliqlari Windows'ga o'rnatilgan
**istalgan printerga** chiqadi (Ctrl+P). Alohida sozlash kerak emas —
tizim Windows printer ro'yxatidan foydalanadi. Chek uchun 58/80 mm termal
printer, yorliq uchun etiket printeri ham shu tarzda ishlaydi.

### Analizatorlar — to'rt xil ulanish

**Boshqaruv → Uskunalar** bo'limida uskuna qo'shiladi:

| Ulanish | Qachon ishlatiladi | Sozlash |
|---|---|---|
| **HL7 (TCP)** | zamonaviy analizatorlar | uskunada LIS IP va portini ko'rsatasiz |
| **ASTM (TCP)** | gematologiya/biokimyo uskunalari | xuddi shunday |
| **Papka** | uskuna natijani faylga yozadi | umumiy papkani ko'rsatasiz |
| **HTTP** | vositachi dastur orqali | uskunaga kalit beriladi |

Ish tartibi:

```
Analizator natija yuboradi  →  tizim uni probirka shtrix-kodi bo'yicha
buyurtmaga bog'laydi  →  natija "uskunadan keldi" belgisi bilan laborant
ekranida turadi  →  laborant tasdiqlaydi  →  bemorga chiqadi
```

Muhim qoidalar:

* Uskuna natijasi **avtomatik tasdiqlanmaydi** — odam ko'rib tasdiqlaydi.
* Uskuna **odam kiritgan qiymatni bosib ketmaydi**.
* Har bir xabar xom holida `device_messages` jadvalida saqlanadi — nizo
  chiqsa "uskuna aynan nima yuborgan" savoliga aniq javob bo'ladi.
* Auditda uskuna alohida ko'rinadi: `Uskuna: Mindray BC-20`.
* Uskuna kodi katalog kodidan farq qilsa, kodlar jadvali orqali bog'lanadi
  (`HB-01` → Gemoglobin), birlik farqi uchun koeffitsiyent beriladi
  (g/dL → g/L bo'lsa 10).

Ulashdan oldin **Sinov** tugmasi bilan tekshirish mumkin: uskuna yuboradigan
xabarni qo'lda kiritib, natija to'g'ri buyurtmaga tushishini ko'rasiz.

Uskuna hali olinmagan bo'lsa hech narsa qilish shart emas — laborant natijani
qo'lda kiritaveradi. Uskuna paydo bo'lganda ulash tartibi:
[`docs/uskuna-ulash.md`](docs/uskuna-ulash.md) (kod yozilmaydi, server qayta
ishga tushirilmaydi, boshqa uskunalarning ishi to'xtamaydi).

### Rentgen va UTT (ultratovush)

Bu qurilmalar odatda **DICOM** protokolida ishlaydi va tasvir yuboradi —
raqamli natija emas. Hozircha ular tizimga to'g'ridan-to'g'ri ulanmaydi:
rentgen/UTT rasmi va shifokor xulosasi bemor kartasiga **fayl sifatida
yuklanadi** (`Fayllar` bo'limi, yil bo'yicha papkalarga tushadi). To'liq
DICOM ulanishi (PACS) alohida bosqich — qurilma modeli aniq bo'lgach
qo'shiladi.

### Kameralar va davomat

**Boshqaruv → Kameralar** bo'limida kamera qo'shiladi: panelda har 5 soniyada
yangilanadigan kadr ko'rinadi, RTSP manzili esa VLC/NVR uchun saqlanadi.

Yuzni tanish AI **kameraning o'zida yoki NVR'da** ishlaydi — LabCore undan
tayyor hodisa oladi (`POST /api/cameras/events`, kamera kaliti bilan) va shu
asosda **Davomat** bo'limida hisoblaydi:

```
Dilnoza Karimova
  08:55 – 12:25   3 s 30 d   (31 ta hodisa)
  12:25 – 13:20   tanaffus 55 daqiqa
  13:20 – 17:04   3 s 44 d   (33 ta hodisa)
  ─────────────────────────────────────────
  Kamerada: 7 s 14 d      Tizimda: 6 s 40 d
```

Ikkala raqam yonma-yon turadi va bir-birini tekshiradi. Batafsil:
[`docs/kamera-ulash.md`](docs/kamera-ulash.md).

**Maxfiylik talablari** (tavsiya emas, majburiy):

* Kamera **bemor hududiga va natija ko'rinib turgan ekranlarga qaratilmasin**.
* Xodimlar kuzatuv borligidan xabardor bo'lishi kerak (ko'p joyda qonun talabi).
* Hojatxona/dam olish xonasi — hech qachon.
* Hodisalar `CAMERA_RETENTION_DAYS` (90 kun) dan keyin avtomatik o'chadi.
* Faqat administrator ko'radi; davomatni ochish ham auditga yoziladi.
* "Kamerada ko'rinmadi" ≠ "ishlamadi" — xodim boshqa xonada bo'lishi mumkin.
  Bu raqam suhbat uchun asos, jazo uchun dalil emas.

---

## 5. Audit — tizimning yuragi

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

## 6. Fayl arxivi

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

## 7. Zaxira nusxa: lokal + bulut

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

### Bulutga nusxa

```bash
sudo -v ; curl https://rclone.org/install.sh | sudo bash   # bir marta
rclone config          # "labcloud" nomli remote yarating (S3, Google Drive, Yandex Disk…)
```

`.env` da:

```
RCLONE_REMOTE=labcloud:labcore-backup
BACKUP_PASSPHRASE=uzun-va-maxfiy-parol
```

**Bulutga faqat shifrlangan nusxa chiqadi** (AES-256). `BACKUP_PASSPHRASE`
bo'sh bo'lsa skript bulutga yuborishni ataylab rad etadi — tibbiy ma'lumot
shifrlanmagan holda binodan chiqmasligi kerak. Parolni yo'qotmang: usiz
zaxirani ochib bo'lmaydi.

**Uch nusxa qoidasi:** server diskida + tashqi diskda/NAS'da (`RSYNC_TARGET`) +
bulutda (`RCLONE_REMOTE`). Zaxirani yiliga kamida bir marta haqiqiy tiklab
ko'ring — tekshirilmagan zaxira zaxira emas.

**Bulut ishlashning sharti emas:** laboratoriya butunlay internetsiz ishlayveradi.
Bulut faqat zaxira uchun; internet tiklanganda navbatdagi nusxa yuboriladi.

Shuningdek kerak: **UPS** (elektr o'chishiga qarshi), disk uchun RAID, server
xonasiga cheklangan kirish.

---

## 8. Xavfsizlik

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

## 9. Buyruqlar

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

## 10. API (qisqacha)

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
| `GET/POST /devices` `/devices/:id/mappings` `/messages` `/simulate` | Uskunalar (admin) |
| `POST /devices/intake` | Uskunadan natija (kalit bilan, login talab qilinmaydi) |
| `GET/POST /cameras` `/cameras/:id/snapshot` `/faces` `/attendance` | Kameralar va davomat (admin) |
| `POST /cameras/events` | Kamera AI hodisasi (kalit bilan) |

---

## 11. Texnik tafsilotlar

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

* **DICOM/PACS** — rentgen va UTT tasvirlarini to'g'ridan-to'g'ri qabul qilish
  (hozircha fayl sifatida yuklanadi).
* **Telegram bot** — xabar navbati va yuborish adapteri tayyor
  (`TELEGRAM_BOT_TOKEN` sozlansa ishlaydi), lekin bemorni botga ulash oqimi
  (`patient_contacts.telegram_chat_id`) qo'lda to'ldiriladi.
* **Push-bildirishnoma** — mobil ilovaga telefon qulflangan holatda
  ogohlantirish yuborish (hozircha ilova ochilganda ko'rsatiladi).
* **Tayyor `.exe`** — o'rnatuvchi Windows yoki `wine` o'rnatilgan kompyuterda
  bitta buyruq bilan yasaladi (`npm run build:win`); repozitoriyda binar fayl
  saqlanmaydi.
* **SMS shlyuzi** — `SMS_GATEWAY_URL` sizning provayderingiz formatiga moslanishi kerak.
