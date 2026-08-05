# LabCore — yuklab olish

Bu shoxobcha faqat tayyor to'plamni saqlash uchun. Kod
`claude/lab-management-system-ipsi88` shoxobchasida.

## Ulanmayaptimi? Bitta tugma bilan tuzatiladi

[**LabCore-TUZATISH.zip**](https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-TUZATISH.zip) — 390 KB

1. Arxivni **to'liq oching** (o'ng tugma → Extract All)
2. **`TUZAT.bat`** → ikki marta bosing → Windows "Ha" so'raydi, tasdiqlang

Skript yangi fayllarni qo'yadi, **serverni qayta ishga tushiradi** va
oxirida dasturga yoziladigan manzilni aytadi:

```
 Server ishlayapti

 DASTURGA SHU MANZILNI YOZING:
   https://localhost:4000
```

Server ko'tarilmasa — **`TEKSHIR.bat`** sababini ko'rsatadi.

**Nima tuzatildi:**

| Xato | Endi |
|---|---|
| Skriptlar administrator huquqisiz ishlab, ".env yo'q" deb noto'g'ri xulosa chiqarardi | Huquqni o'zi so'raydi (UAC) |
| Fayllar almashtirilardi, server esa eski holatda qolardi | `TUZAT.bat` serverni qayta ishga tushiradi va tekshiradi |
| Windows'da server jimgina ishga tushmasdi | Yo'l farqi `pathToFileURL` bilan hisobga olinadi |
| `.bat` oynasi ochilib darrov yopilib ketardi | CRLF; skript o'zi Enter kutadi |
| Server xatosi hech qayerda ko'rinmasdi | `logs\server.log` jurnali |
| `HOLAT.bat`: `parameter 'SkipCertificateCheck'` | PowerShell 5.1 uchun to'g'ri usul |
| `postgres` paroli noto'g'ri bo'lsa ham "OK" | Parol oldindan tekshiriladi |
| `localhost` IPv6 → `Permission denied (10013)` | `psql` aniq `127.0.0.1` ga ulanadi |
| `openssl topilmadi` → HTTPS yasalmasdi | Windows PFX ishlatiladi |
| Ruscha Windows'da `identity references` xatosi | Hisob nomlari o'rniga SID |

---

## Internet yo'q bo'lsa (fleshka orqali o'rnatish)

Server kompyuterda internet bo'lishi **shart emas**. Telefonda yoki internet
bor boshqa kompyuterda uchta faylni yuklab oling va fleshkaga soling:

| Fayl | Hajmi | Havola |
|---|---|---|
| `LabCore-toliq.zip` | 82 MB | https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-toliq.zip |
| Node.js LTS | ~30 MB | https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi |
| PostgreSQL | ~350 MB | https://www.postgresql.org/download/windows/ |

Tartib: **Node.js → PostgreSQL → kompyuterni qayta yoqing → `ORNATISH.bat`
(o'ng tugma → Run as administrator)**.

LabCore'ning o'z kutubxonalari arxiv ichida keladi — o'rnatish paytida
internet umuman so'ralmaydi.

**Ikkita tuzoq:**

* PostgreSQL o'rnatilgach **"Stack Builder"** oynasi chiqadi — **Cancel**
  bosing. U qo'shimcha dasturlarni internetdan yuklaydi, LabCore uchun kerak emas.
* Internetdan **Chocolatey** o'rnatadigan buyruqlarni (`choco install ...`)
  ishlatmang — ular internet talab qiladi va bu yerda umuman kerak emas.

---

## LabCore-YANGILASH.zip (2.8 MB) — allaqachon o'rnatganlar uchun

Tizim o'rnatilgan bo'lsa, hammasini qayta o'rnatish shart emas: shu kichik
to'plam serverdagi fayllarni yangilaydi. Bemor ma'lumotlari, fayllar va
sozlamalar (`.env`) tegilmaydi.

1. Arxivni oching
2. `YANGILASH.bat` → o'ng tugma → **Run as administrator**
3. Brauzerni yangilang (Ctrl+F5)

Skript o'zi zaxira oladi, serverni to'xtatadi, fayllarni almashtiradi,
bazaga yangi ustunlarni qo'shadi va serverni qayta ishga tushiradi.

**Nima yangi:**

| Imkoniyat | Qayerda |
|---|---|
| Xodim rasmi | Xodimlar → "Rasm" (xodim o'zi: Sozlamalar → "Mening rasmim") |
| PIN kod bilan kirish | Xodimlar → "PIN qo'yish"; kirish oynasida rasmni bosib teriladi |
| Avtozapusk | `server\deploy\windows\avtozapusk.ps1` (`-Off`, `-Status`) |

Xodim kompyuterlaridagi `LabCore-DASTUR.exe` ni almashtirish **shart emas** —
u serverdagi interfeysni ochadi, yangi bo'limlar o'zi paydo bo'ladi.

---

## LabCore-toliq.zip (82 MB) — birinchi marta o'rnatish uchun

Ichida:

| Fayl | Nima |
|---|---|
| `ORNATISH.bat` | serverni o'rnatadi (o'ng tugma → "Run as administrator") |
| `LabCore-DASTUR.exe` | Windows ish stansiyasi dasturi (o'rnatish shart emas) |
| `HOLAT.bat` | server ishlayaptimi — tekshirish |
| `TELEFONGA-ULASH.bat` | telefon uchun QR kod sahifasi |
| `OQING.txt` | qadamma-qadam ko'rsatma |
| `server/` | tizimning o'zi (kutubxonalari bilan — internet kerak emas) |

## Oldindan kerak

1. **Node.js LTS** — https://nodejs.org
2. **PostgreSQL** — https://www.postgresql.org/download/windows/
   (o'rnatishda `postgres` uchun parol so'raydi — yozib qo'ying)

## O'rnatish

1. Arxivni oching
2. `ORNATISH.bat` → o'ng tugma → **Run as administrator**
3. `LabCore-DASTUR.exe` ni ishga tushiring

Batafsil: arxiv ichidagi `OQING.txt` va `server/docs/ornatish.md`.

## Nazorat summasi

```
LabCore-toliq.zip      a0143b279445ecfe636308e6d3c0f225988b6c864a1842926a15f8bc905658c0
LabCore-TUZATISH.zip   d47aa91a5d0d5cfdd046a65efc6c50fccd0597a4b4f6c762858aad9d3bd30673
LabCore-YANGILASH.zip  4201dc4545de284082263f10e95bd65b259f0756ec936cd8ba369cbad198230a
```

## Tuzatishlar tarixi

**2026-08-05 (3.7-nashr).** `.env` ataylab faqat administratorlarga ochiq
(unda baza paroli bor). Skriptlar oddiy huquq bilan ishlatilganda faylni
o'qiy olmay, "sozlanmagan" deb noto'g'ri xulosa chiqarardi; node esa
`DATABASE_URL` ni sukut qiymatiga tushirib `SASL: client password must be
a string` xatosini berardi. Endi skriptlar huquqni o'zi so'raydi va
`TUZAT.bat` serverni qayta ishga tushirib, natijani tekshiradi.

**2026-08-05 (3.6-nashr).** Windows'da server umuman ishga tushmasdi:
`import.meta.url === \`file://${process.argv[1]}\`` tekshiruvi Windows
yo'llarida hech qachon mos kelmaydi, shuning uchun `start()` chaqirilmasdi
va jarayon xabarsiz tugardi. Endi `pathToFileURL` ishlatiladi.
Testlarga `tests/entry.test.js` qo'shildi — serverni haqiqatan ishga
tushirib tekshiradi.

**2026-08-05 (3.5-nashr).** `.bat` fayllar Linux'da yasalgani uchun qator
tugashi `\n` edi; `cmd.exe` esa `\r\n` kutadi va faylni buzib o'qir,
oyna `pause` ga yetmasdan yopilib ketardi. Barcha `.bat` lar CRLF ga
o'girildi, `TUZAT.bat`/`TEKSHIR.bat` 5 qatorga qisqartirildi va
skriptlarning o'zi Enter kutadigan bo'ldi.

**2026-08-05 (3.4-nashr).** Server ishga tushmasa sababi endi ko'rinadi:
vazifa chiqishini `logs\server.log` ga yozadi, `TEKSHIR.bat` esa jurnalni
ko'rsatib, serverni o'zi sinab ishga tushiradi va xatoni ekranga chiqaradi.
`HOLAT.bat` PowerShell 5.1 da yiqilib qolardi (`-SkipCertificateCheck`
faqat PowerShell 7 da bor) - tuzatildi.

**2026-08-05 (3.3-nashr).** O'rnatuvchi `psql` xatosini yutib yuborardi:
`postgres` paroli noto'g'ri kiritilsa ham "OK" deb davom etar, baza va
foydalanuvchi yaratilmas, xato esa ancha keyin — migratsiya paytida
chiqardi. Endi parol oldindan tekshiriladi va qayta so'raladi, har bir
amal natijasi ko'riladi, oxirida server javob berayotgani tasdiqlanadi.
`psql` "localhost" o'rniga `127.0.0.1` ga ulanadi (IPv6 bloklanishi).

**2026-08-05 (3.2-nashr).** HTTPS uchun `openssl` kerak emas. Ilgari
o'rnatuvchi sertifikatni PEM'ga o'girish uchun openssl'ni qidirardi, u
Windows'da odatda yo'q — natijada server HTTPS'siz qolib, dastur
"ECONNREFUSED" berardi. Endi Windows yasaydigan PFX to'g'ridan-to'g'ri
ishlatiladi. `TEKSHIR.bat` qo'shildi: ulanmagan holatda sababni topadi va
qaysi manzilni yozish kerakligini aytadi.

**2026-08-05 (3.1-nashr).** Ruscha Windows'da o'rnatish 3/8-qadamda
to'xtab qolardi: `.env` fayl huquqlari inglizcha `Administrators` va
`SYSTEM` nomlari bilan qo'yilgan edi, ular boshqa tildagi Windows'da yo'q.
Endi SID ishlatiladi (`S-1-5-32-544`, `S-1-5-18`) va huquq qo'yilmasa ham
o'rnatish to'xtamaydi. Shu bilan birga: rejalashtirilgan vazifa `node.exe`
ni to'liq manzili bilan chaqiradi, server manzili tanlashda
VirtualBox/WSL/VPN adapterlari chetlab o'tiladi.

**2026-08-05 (3-nashr).** Xodim rasmi, PIN kod bilan kirish va Windows
avtozapusk qo'shildi. `LabCore-toliq.zip` yangilandi — endi to'g'ridan-to'g'ri
3-nashrni o'rnatadi. Internetsiz o'rnatish yo'riqnomasi ham qo'shildi
(`OQING.txt` va yuqoridagi bo'lim).

Ichidagi `LabCore-DASTUR.exe` 2-nashrdan qolgan: u serverdagi interfeysni
ochgani uchun yangi bo'limlarning hammasi unda ko'rinadi, faqat dastur
menyusidagi avtozapusk belgisi yo'q — buning o'rniga `avtozapusk.ps1`.

**2026-08-04 (2-nashr).** Windows PowerShell 5.1 `.ps1` faylni ANSI deb
o'qigani uchun skriptlar ishga tushmasdi ("Unexpected token" xatolari).
Skriptlar endi faqat ASCII belgilardan iborat. Birinchi nashrni yuklab
olgan bo'lsangiz — qayta yuklab oling yoki faqat
`server/deploy/windows/*.ps1` fayllarini almashtiring.
