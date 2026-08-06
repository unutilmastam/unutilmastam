# LabCore — yuklab olish

Bu shoxobcha faqat tayyor to'plamni saqlash uchun. Kod
`claude/lab-management-system-ipsi88` shoxobchasida.

## ⬇ TO'LIQ DASTUR — birinchi marta o'rnatish uchun

[**LabCore-toliq.zip**](https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-toliq.zip) — **81 MB, 4-nashr**

Butun tizim shu bitta arxivda. **Internet kerak emas** — kutubxonalarning
hammasi (1794 ta fayl) ichida keladi.

| Ichida | Nima |
|---|---|
| `ORNATISH.bat` | hamma narsani o'zi o'rnatadi (o'ng tugma → Run as administrator) |
| `LabCore-DASTUR.exe` | xodim kompyuterlari uchun dastur, 71 MB, o'rnatish shart emas |
| `server/` | tizimning o'zi — kod, baza sxemasi, kutubxonalar |
| `server/docs/LabCore-HAMMASI.html` | to'liq hujjat: 13 bo'lim, 44 rasm |
| `TEKSHIR.bat` `HOLAT.bat` `TELEFONGA-ULASH.bat` | tekshiruv va yordamchi tugmalar |
| `OQING.txt` | qadamma-qadam ko'rsatma |

**Bu nashrda:** server barqarorligi tuzatildi (quyida), ish stansiyasi
dasturi qayta yig'ildi, xodim rasmi, PIN kod bilan kirish va avtozapusk
qo'shildi. Arxivdagi 108 ta test o'z ichidagi kutubxonalar bilan
tekshirilgan — hammasi o'tadi.

Kerak bo'ladigan boshqa ikkita fayl (telefonda yuklab olib, fleshkaga soling):

| Fayl | Hajmi | Havola |
|---|---|---|
| Node.js LTS | ~30 MB | https://nodejs.org/dist/v22.20.0/node-v22.20.0-x64.msi |
| PostgreSQL | ~350 MB | https://www.postgresql.org/download/windows/ |

Tartib: **Node.js → PostgreSQL → kompyuterni qayta yoqing → `ORNATISH.bat`**

---

## 📘 Bitta faylda hammasi (hujjat)

[**LabCore-HAMMASI.html**](https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-HAMMASI.html) — 4.3 MB

Bitta fayl, 13 ta bo'lim, **44 ta haqiqiy ekran rasmi**. Yuklab olib
brauzerda oching — internet kerak emas, hamma rasm faylning ichida.
Telefonda ham, kompyuterda ham o'qiladi.

| Bo'lim | Nima bor |
|---|---|
| **A. Tizim nima qila oladi** | 15 ta bo'lim, 25 ta baza jadvali, 111 ta manzil, 4 ta rol |
| **B. Boshlashdan oldin** | Qanday kompyuter kerak, nima o'rnatiladi |
| **C. Internetsiz o'rnatish** | Fleshka orqali, uchta fayl, ikkita tuzoq |
| **D. O'rnatish — sakkiz qadam** | Boshidan oxirigacha, rasmlar bilan |
| **E. Ochiladigan oyna** | Qayerda nima turadi, rol bo'yicha menyu |
| **F. Kundalik ish** | Bemor yo'li: navbatdan chekgacha |
| **G. Rahbar nazorati** | Audit, ish nazorati, kameralar, telefon paneli |
| **H. Qo'shimcha sozlashlar** | Uskunalar, ombor, sozlamalar |
| **I. Xodim rasmi, PIN va avtozapusk** | Oxirgi qo'shilgan imkoniyatlar |
| **J. Har kungi xizmat** | Zaxira, tiklash, tez-tez uchraydigan holatlar |
| **K. Tuzatishlar tarixi** | **12 ta xato**: belgisi, sababi, yechimi va qo'yilgan test |
| **L. Texnik ma'lumot** | Tuzilishi, fayllar, buyruqlar, xavfsizlik |
| **M. Tezkor ma'lumotnoma** | Bir sahifada eng kerakli narsalar |

Shu fayl `LabCore-toliq.zip` ichida ham bor:
`server\docs\LabCore-HAMMASI.html`.

---

## ⚠ Server "bir ishlab, bir ishlamayaptimi?" — tuzatildi

[**LabCore-TUZATISH.zip**](https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-TUZATISH.zip) — 390 KB
→ arxivni oching → **`TUZAT.bat`** → ikki marta bosing.

**Sabab.** Server bazaga bir nechta ulanishni ochiq saqlab turadi. Ulardan
biri **bo'sh turganda** uzilib qolsa — antivirus, brandmauer yoki VPN bo'sh
TCP ulanishini yopsa, yoki PostgreSQL'ning o'zi uzsa — bu xato hech kim
tomonidan ushlanmasdi va Node butun serverni **o'sha zahoti**, hech qanday
xabar qoldirmasdan to'xtatib qo'yardi. Windows vazifasi uni qayta ko'tarardi,
bir necha daqiqadan keyin yana o'chardi.

**Endi:**

* bo'sh ulanishdagi xato ushlanadi — buzilgan ulanish tashlab yuboriladi,
  keyingi so'rov yangisini oladi, **server ishlashda davom etadi**;
* ulanishlar `keepAlive` bilan yangilanib turadi va 30 soniya ishlatilmasa
  yopiladi — tashqi tomon ularni "o'ldirishga" ulgurmaydi;
* har qanday kutilmagan xato **vaqti bilan** `logs\server.log` ga yoziladi
  (`QULASH` so'zi bilan) — server boshqa "sababsiz" o'chmaydi;
* `TUZAT.bat` serverni qayta ishga tushirgach uni **30 soniya kuzatadi**;
  "ishlayapti va barqaror" degan xulosa faqat shundan keyin chiqadi;
* `TEKSHIR.bat` jurnaldan qulash tarixini topib ko'rsatadi — server ayni
  damda ishlab turgan bo'lsa ham.

> `TEKSHIR.bat` ning "Serverni sinab ishga tushiramiz" bo'limi serverni
> 8 soniya ishlatib, keyin **o'zi** to'xtatadi. Bu nosozlik emas — endi
> ekranda shunday deb yoziladi.

---

## Ish stansiyasi dasturi yangilandi

Dastur "Ulanib bo'lmadi: server javob bermadi" deb mazmunsiz xabar berardi
va sozlash oynasida avtozapusk belgisi yo'q edi. Yangi nusxa:

[**LabCore-DASTUR.exe**](https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-DASTUR.exe) — 71 MB

Eski faylning ustiga yozing (o'rnatish shart emas, shundoq ishlaydi).

* sozlash oynasida **"Kompyuter yoqilganda avtomatik ochilsin"** belgisi
* menyuda **Sozlamalar → avtozapusk** o'chirgichi
* ulanish xatosi endi sababini aytadi ("bazaga ulana olmayapti", kod bilan)
* dastur ikki marta ochilmaydi

`LabCore-toliq.zip` ichida ham shu yangi nusxa bor.

---

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
| Server bir necha soniya ishlab, sababsiz o'chib qolardi | Bo'sh ulanishdagi baza xatosi ushlanadi |
| Qulash sababi hech qayerda qolmasdi | `QULASH` satri jurnalga vaqti bilan yoziladi |
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
| `LabCore-toliq.zip` | 81 MB | https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/LabCore-toliq.zip |
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

## LabCore-toliq.zip (81 MB) — birinchi marta o'rnatish uchun

Ichida:

| Fayl | Nima |
|---|---|
| `ORNATISH.bat` | serverni o'rnatadi (o'ng tugma → "Run as administrator") |
| `LabCore-DASTUR.exe` | Windows ish stansiyasi dasturi (o'rnatish shart emas) |
| `HOLAT.bat` | server ishlayaptimi — tekshirish |
| `TELEFONGA-ULASH.bat` | telefon uchun QR kod sahifasi |
| `OQING.txt` | qadamma-qadam ko'rsatma |
| `server/docs/LabCore-HAMMASI.html` | to'liq hujjat — 13 bo'lim, 44 rasm |
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
LabCore-toliq.zip      420cf4051a2bee670dbb4c82e52afb94a8f797339f4427502f0b75b97f87736f
LabCore-DASTUR.exe     6c407448f4d0a708dddfd46120923fdb51ae3cc79ecea5f2ad0f29b8ae5f2d40
LabCore-TUZATISH.zip   2df91b05056d32f44e2a549a17b01c2a25d2ecbe7e6abcaad19b68b6dfe94c1d
LabCore-YANGILASH.zip  8b4c0650eeb3364cc6d18837db1e6001a75fa95477a6fea90b511b68859cded5
LabCore-HAMMASI.html   e1b6bbdc1873e8b42949c8788fb9229668e2cd26e6ccd37aa59e74d6270d15a6
```

## Tuzatishlar tarixi

**2026-08-06 (to'liq arxiv qayta yig'ildi).** `LabCore-toliq.zip` boshidan
qayta yasaldi: server kodi, interfeys, baza sxemasi, testlar va ish
stansiyasi dasturining manbasi joriy holatdan olindi (ilgari arxivdagi
`desktop/main.js` va testlar bir nashr orqada qolib ketgan edi).
Arxivdagi nusxa yig'ishdan oldin tekshirildi: o'z ichidagi kutubxonalar
bilan server ko'tariladi va 108 ta testning hammasi o'tadi.
`OQING.txt` yangilandi.

**2026-08-06.** `LabCore-HAMMASI.html` qo'shildi — qilingan ishlarning
hammasi bitta faylda: tizim imkoniyatlari, internetsiz o'rnatish, rasmli
qo'llanma (44 ta ekran), tuzatilgan 12 ta xatoning har biri uchun sabab,
yechim va qo'yilgan test, texnik ma'lumot va tezkor ma'lumotnoma. Fayl
o'zi yetarli: internet, shrift va tashqi rasm talab qilmaydi.

**2026-08-06 (4-nashr).** Server "bir ishlab, bir ishlamas" edi: ko'tariladi,
bir necha soniya yoki daqiqadan keyin hech qanday xabarsiz o'chadi, vazifa uni
qayta ko'taradi — va shu takrorlanaveradi. Sababi `pg.Pool` ning **bo'sh
turgan ulanishi**: unda xato yuz berganda hovuz `error` hodisasini chiqaradi,
uni tinglovchi bo'lmagani uchun esa Node butun jarayonni to'xtatib qo'yardi.
Ulanishni antivirus, brandmauer, VPN yoki PostgreSQL'ning o'zi uzishi kifoya
edi. Endi bu xato ushlanadi, `keepAlive` va idle vaqti sozlangan, kutilmagan
har qanday xato esa `logs\server.log` ga vaqti bilan yoziladi. Testlarga
`tests/barqarorlik.test.js` qo'shildi — haqiqiy PostgreSQL ulanishini uzib,
jarayon tirik qolishini tekshiradi.

**2026-08-06 (3.8-nashr).** `LabCore-DASTUR.exe` qayta yig'ildi: avtozapusk
belgisi, bitta nusxa qulfi va ulanish xatosining aniq sababi endi dastur
ichida. Ilgari `.exe` 2-nashrdan qolgan edi.

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
