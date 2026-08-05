# LabCore — yuklab olish

Bu shoxobcha faqat tayyor to'plamni saqlash uchun. Kod
`claude/lab-management-system-ipsi88` shoxobchasida.

## Tez tuzatish: o'rnatish 3/8-qadamda to'xtab qolsa

Ekranda qizil xato chiqsa:

```
Exception calling "AddAccessRule" with "1" argument(s):
"Some or all identity references could not be translated."
```

bu — **ruscha (yoki boshqa tildagi) Windows** muammosi: skript inglizcha
`Administrators` / `SYSTEM` hisob nomlarini qidirardi, ular esa faqat
inglizcha Windows'da bor. Tuzatildi.

**Butun arxivni qayta yuklamasdan tuzatish** — bitta kichik fayl (10 KB):

1. Yuklab oling: https://github.com/unutilmastam/unutilmastam/raw/yuklab-olish/install-server.ps1
2. Faylni arxivni ochgan papkangizdagi shu joyga qo'ying (eskisini almashtiring):
   `LabCore-toliq\server\deploy\windows\install-server.ps1`
3. `ORNATISH.bat` → o'ng tugma → **Run as administrator** — boshidan qayta ishga tushiring.

Qayta ishga tushirish xavfsiz: baza mavjud bo'lsa saqlab qolinadi.

Yoki yangilangan `LabCore-toliq.zip` ni to'liq qayta yuklab oling — ichida
xuddi shu tuzatish bor.

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
LabCore-toliq.zip      00e36403561f4d28b66cc75593cadc1f878434c4186d9594a2490e7283ad72bf
LabCore-YANGILASH.zip  4201dc4545de284082263f10e95bd65b259f0756ec936cd8ba369cbad198230a
install-server.ps1     2fb685e9bb1b0efdb0b2f30d10f89176dd169b15b4909fb5fcc984fbd6a7f733
```

## Tuzatishlar tarixi

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
