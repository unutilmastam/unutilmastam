# O'rnatish qo'llanmasi: server, Windows kompyuterlar va telefon

Bu hujjat bo'yicha ishlansa, laboratoriya bir kunda ishga tushadi.

```
                    ┌──────────────────────────┐
                    │  SERVER KOMPYUTERI       │
                    │  (Windows yoki Ubuntu)   │
                    │  LabCore + PostgreSQL    │
                    │  192.168.1.10            │
                    └────────────┬─────────────┘
                                 │  lokal tarmoq (router)
        ┌────────────────┬───────┴────────┬────────────────┐
        │                │                │                │
   Registratura      Laborant         Kassa          Egasi (telefon)
   LabCore.exe       LabCore.exe      LabCore.exe    ilova (PWA)
```

**Internet kerak emas.** U faqat SMS/Telegram va bulutga zaxira uchun.

---

## 1. Nima kerak bo'ladi

| Nima | Talab | Izoh |
|---|---|---|
| Server kompyuteri | Windows 10/11 yoki Ubuntu, 8 GB RAM, SSD | Doim yoqiq turadi |
| UPS | 15–30 daqiqaga yetadigan | Elektr o'chganda baza buzilmasligi uchun |
| Router / kommutator | oddiy | Barcha kompyuterlar bitta tarmoqda |
| Ish stansiyalari | Windows 10/11 | Laborant, shifokor, kassa, registratura |
| Tashqi disk | 500 GB dan | Kunlik zaxira uchun |

Serverga **statik IP** bering (router sozlamasida yoki Windows tarmoq sozlamasida),
masalan `192.168.1.10`. IP o'zgarib tursa, ish stansiyalari serverni topa olmaydi.

---

## 2. Server: Windows

### 2.1. Oldindan o'rnatiladi

1. **Node.js LTS** — https://nodejs.org (yashil "LTS" tugmasi).
2. **PostgreSQL** — https://www.postgresql.org/download/windows/
   O'rnatishda `postgres` foydalanuvchisiga parol so'raydi — **shu parolni yozib qo'ying**.
3. O'rnatishdan keyin kompyuterni qayta yoqing.

### 2.2. LabCore

Loyiha papkasini serverga ko'chiring (masalan `C:\LabCore-setup`), so'ng
**PowerShell'ni "Administrator sifatida ishga tushirish"** bilan oching:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
cd C:\LabCore-setup\lims\deploy\windows
.\install-server.ps1 -LabName "Sizning laboratoriyangiz"
```

Skript o'zi bajaradi:

* bazani va foydalanuvchini yaratadi (parol tasodifiy, `.env` ga yoziladi);
* `.env` faylini faqat administrator o'qiy oladigan qilib qo'yadi;
* sxemani o'rnatadi va analiz katalogini yozadi;
* **HTTPS sertifikat** yasaydi (telefon uchun shart);
* brandmauerda 4000 va 4080 portlarini ochadi;
* kompyuter yoqilganda avtomatik ishga tushishini sozlaydi;
* har kuni 01:30 da zaxira olishni sozlaydi.

Oxirida ekranda server manzili va birinchi login/parol chiqadi.

### 2.3. Tekshirish

```powershell
cd C:\LabCore\deploy\windows
.\status.ps1
```

Ko'rsatishi kerak: vazifa `Running`, server `ishlayapti`, baza `up`.

Server brauzerida `https://localhost:4000` ni oching → **admin** / seed bergan parol.
**Birinchi kirishdayoq parolni almashtiring** (Sozlamalar bo'limi) va ikki
bosqichli loginni yoqing.

### 2.4. Qo'lda ishga tushirish / to'xtatish

```powershell
Start-ScheduledTask -TaskName LabCore     # ishga tushirish
Stop-ScheduledTask  -TaskName LabCore     # to'xtatish
```

Sinov uchun oynada ko'rib turib ishga tushirish: `deploy\windows\start-labcore.bat`

---

## 3. Server: Ubuntu

Batafsil — asosiy `README.md`, "O'rnatish" bo'limi. Qisqacha:

```bash
sudo apt install -y postgresql nodejs npm
sudo -u postgres psql -c "CREATE USER labcore WITH PASSWORD 'kuchli-parol';"
sudo -u postgres psql -c "CREATE DATABASE labcore OWNER labcore;"
cd /opt/labcore && npm ci --omit=dev
cp .env.example .env && nano .env      # DATABASE_URL, JWT_SECRET, SSL_*
npm run migrate && npm run seed
sudo cp deploy/labcore.service /etc/systemd/system/ && sudo systemctl enable --now labcore
```

HTTPS uchun sertifikat:

```bash
sudo openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /opt/labcore/ssl/labcore.key -out /opt/labcore/ssl/labcore.crt \
  -subj "/CN=labcore.lab.local" \
  -addext "subjectAltName=IP:192.168.1.10,DNS:labcore.lab.local"
```

`.env` ga qo'shing:

```
SSL_CERT_FILE=/opt/labcore/ssl/labcore.crt
SSL_KEY_FILE=/opt/labcore/ssl/labcore.key
SSL_REDIRECT_FROM_PORT=4080
```

Nginx **shart emas** — server o'zi HTTPS'da ishlaydi.

---

## 4. Ish stansiyalari: Windows dasturi

### 4.1. O'rnatuvchi (.exe) yasash

Bir marta, istalgan Windows kompyuterda:

```powershell
cd lims\desktop
npm install
npm run build:win
```

Natija: `lims\desktop\dist\LabCore Setup 1.0.0.exe` — shu faylni barcha ish
stansiyalariga ko'chirasiz.

> Linux/macOS'da yasash uchun `wine` kerak. Windows'da yasagan osonroq.

### 4.2. Har bir kompyuterga o'rnatish

1. `LabCore Setup 1.0.0.exe` ni ishga tushiring, "Next" bilan o'rnating.
2. Birinchi ochilganda **server manzili** so'raladi: `https://192.168.1.10:4000`
3. **"Ulanishni tekshirish"** tugmasini bosing — laboratoriya nomi chiqsa,
   ulanish to'g'ri.
4. "Saqlash va davom etish" → login oynasi.

Kompyuter nomi (`LAB-PC-02`) Windows'dan avtomatik olinadi va audit jurnaliga
yoziladi — xodim uni o'zgartira olmaydi.

### 4.3. Dastursiz ham bo'ladi

Brauzerda `https://192.168.1.10:4000` ni ochish yetarli. Faqat
**Sozlamalar → Ish stansiyasi** bo'limida kompyuter nomini qo'lda kiriting.

Sertifikat ogohlantirishi chiqsa: "Advanced" → "Proceed". Buni butunlay
yo'qotish uchun 5-bo'limdagi sertifikatni shu kompyuterga ham o'rnating.

---

## 5. Telefon: rahbar ilovasi

Telefonda ilova **PWA** ko'rinishida o'rnatiladi — Play Market yoki App Store
kerak emas.

### 5.1. Avval sertifikatni o'rnating (bir marta)

Bu qadam **majburiy**: HTTPS bo'lmasa ilova o'rnatilmaydi va oflayn ishlamaydi.

Serverdagi `C:\LabCore\ssl\labcore-ca.cer` (Ubuntu'da `labcore.crt`) faylini
telefonga yuboring (Telegram, USB, elektron pochta — farqi yo'q).

**Android:**
1. Sozlamalar → Xavfsizlik → Shifrlash va hisob ma'lumotlari →
   "Sertifikat o'rnatish" → "CA sertifikati"
2. Faylni tanlang, "Baribir o'rnatish" ni tasdiqlang.

**iPhone:**
1. Faylni oching → "Profil yuklab olindi" → Sozlamalar → "Profil yuklandi" →
   "O'rnatish".
2. So'ng: Sozlamalar → Umumiy → Ma'lumot → **Sertifikatga ishonch sozlamalari** →
   LabCore yonidagi kalitni yoqing. (Bu qadam o'tkazib yuborilsa ishlamaydi.)

### 5.2. Ilovani o'rnatish

1. Telefonni laboratoriya **Wi-Fi** iga ulang.
2. Brauzerda `https://192.168.1.10:4000` ni oching, tizimga kiring.
3. Menyudan:
   * **Android (Chrome):** ⋮ → "Ilovani o'rnatish" / "Bosh ekranga qo'shish"
   * **iPhone (Safari):** ⎙ (ulashish) → "Bosh ekranga qo'shish"
4. Bosh ekranda 🧪 belgichasi paydo bo'ladi — bosilganda brauzer paneli
   ko'rinmaydi, oddiy ilovadek ochiladi.

Ilova **Rahbar paneli** bilan ochiladi: bugungi bemorlar, analizlar, onlayn
xodimlar, daromad, kritik natijalar, so'nggi o'zgarishlar. Har 30 soniyada
yangilanadi.

### 5.3. Laboratoriyadan tashqarida ishlatish

Telefon boshqa tarmoqda bo'lsa server ko'rinmaydi. Ikki yo'l:

* **VPN** (tavsiya etiladi) — routerda VPN server yoqiladi, telefon shunga
  ulanadi va hamma narsa ishlaydi;
* serverni internetga to'g'ridan-to'g'ri **ochmang** — tibbiy ma'lumot uchun
  bu xavfli.

Aloqa bo'lmasa ilova baribir ochiladi va oxirgi ko'rsatkichlarni
"⚠️ Aloqa yo'q" belgisi bilan ko'rsatadi.

---

## 6. Ishga tushirish oldidan tekshiruv ro'yxati

- [ ] Serverga statik IP berildi
- [ ] `status.ps1` yashil natija beradi
- [ ] `admin` paroli almashtirildi, ikki bosqichli login yoqildi
- [ ] Har bir xodimga alohida hisob ochildi (umumiy hisobdan foydalanilmaydi)
- [ ] Analiz katalogi va narxlar tekshirildi
- [ ] Har bir ish stansiyasida dastur ochilib, kompyuter nomi to'g'ri ko'rindi
- [ ] Telefonga ilova o'rnatildi va rahbar paneli ochildi
- [ ] Printer sinovdan o'tdi (natija blankasi va chek)
- [ ] Zaxira ishlayotgani tekshirildi: `backups` papkasida bugungi nusxa bor
- [ ] **Zaxiradan tiklash bir marta sinab ko'rildi** (eng muhimi)
- [ ] Tashqi disk ulandi va `BACKUP_COPY_TO` sozlandi
- [ ] UPS ulandi

---

## 7. Tez-tez uchraydigan muammolar

| Belgi | Sabab va yechim |
|---|---|
| Dastur "Serverga ulanib bo'lmadi" deydi | Server o'chiq yoki IP o'zgargan. Serverda `status.ps1` ni ishlating |
| Brauzer "Ulanish xavfsiz emas" deydi | Sertifikat o'rnatilmagan. 5.1-bo'limga qarang yoki "Advanced → Proceed" |
| Telefonda "Bosh ekranga qo'shish" chiqmayapti | HTTPS yo'q yoki sertifikat ishonchli emas |
| Boshqa kompyuterdan ochilmayapti | Brandmauer. Serverda: `New-NetFirewallRule -DisplayName "LabCore 4000" -Direction Inbound -Protocol TCP -LocalPort 4000 -Action Allow` |
| Server ishga tushmayapti | `deploy\windows\start-labcore.bat` ni oching — xato matni ko'rinadi |
| "sxema o'rnatilmagan" xatosi | `npm run migrate` bajarilmagan |
| Zaxira olinmayapti | `pg_dump` topilmagan: PostgreSQL `bin` papkasini `Path` ga qo'shing |
| Sana bir kun farq qilyapti | `.env` dagi `TZ_NAME` ni tekshiring (`Asia/Tashkent`) |

---

## 8. Kundalik va haftalik ishlar

**Har kuni (1 daqiqa):** `status.ps1` — server ishlayaptimi, bugungi zaxira bormi.

**Har hafta:** tashqi diskdagi nusxani tekshiring; ombor va muddati
tugayotgan reaktivlar ro'yxatiga qarang.

**Har oy:** xodimlar ro'yxatini ko'rib chiqing (ishdan bo'shaganlar
o'chirilganmi), audit jurnalini ko'zdan kechiring.

**Yiliga bir marta:** zaxiradan **haqiqiy tiklashni** sinab ko'ring.
Tekshirilmagan zaxira — zaxira emas.
