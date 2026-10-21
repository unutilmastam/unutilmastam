# Unutilmas Ta'm v14.5 — magazin egalari xaritaga chiqmayotgan edi

140 ta sinov, **0 ta xato**. **Dizaynga umuman tegilmadi.**

Butun loyihadan faqat 5 ta fayl o'zgardi va 1 tasi qo'shildi:

```
yangi      js/30-storelink.js
o'zgardi   js/3-auth.js
o'zgardi   js/7-stores.js
o'zgardi   js/13-admin.js
o'zgardi   index.html      (faqat 1 qator: yangi fayl ulandi)
o'zgardi   sw.js           (versiya 144 -> 145)
```

CSS fayllarining birortasiga ham tegilmadi — rang, shrift, joylashuv,
hammasi o'z holicha.

---

## Nega 29 ta egasi xaritada yo'q edi

Ikkita alohida sabab bor edi.

**1. Tuzatish ma'lumot kelishidan OLDIN ishlab tugardi.**

Ilovada allaqachon "egalarni do'konlarga bog'lash" funksiyasi bor edi.
Lekin u ilova ochilgandan keyin **3,2 soniyada bir marta** ishga
tushardi. Bulutdagi 29 ta foydalanuvchi esa odatda undan **keyinroq**
yetib keladi. Natijada u har safar **bo'sh ro'yxat** ustida ishlab,
"hamma joyida" deb tugardi.

Endi bog'lash **bulutdan ma'lumot kelgan har safar** qayta ishlaydi.
Ma'lumot kech kelsa ham yetib boradi.

**2. "Tasdiq kutayotgan" egalar umuman hisobga olinmasdi.**

Eski kod faqat `tasdiqlangan` egalarni ko'rardi. Yangi ro'yxatdan
o'tganlarning hammasi esa `tasdiq kutilmoqda` holatida bo'ladi — ya'ni
aynan ularning hech biri xaritaga tushmasdi.

Endi tasdiqlangan ham, tasdiq kutayotgan ham do'kon kartasini oladi.
Tasdiq faqat **ulgurji narxlarni** ochadi — xaritada ko'rinishga
aloqasi yo'q. (Rad etilgan egaga karta ochilmaydi.)

---

## Endi qanday ishlaydi

Magazin egasi ro'yxatdan o'tsa — **uch joyga birdan** chiqadi:
foydalanuvchilar ro'yxatiga, **"Magazinlar ro'yxati"** bo'limiga va
**xaritaga**.

- Ro'yxatdan o'tishda xaritada joy belgilagan bo'lsa — nuqta **aynan
  o'sha yerga** qo'yiladi
- Belgilamagan bo'lsa — vaqtincha nuqta qo'yiladi va `needsLocation`
  belgisi yoziladi; siz xaritadan aniqlashtirganingizdan keyin u
  qayta surilmaydi

> **MUHIM:** do'kon kartasini **faqat admin qurilmasi** yarata oladi —
> Firebase qoidalari `stores` bo'limini oddiy foydalanuvchiga
> yozdirmaydi. Shuning uchun yangi egasi ro'yxatdan o'tgandan keyin
> **siz ilovani ochishingiz kerak** (yoki ochiq tursa — o'zi). Bir
> necha soniyada 29 tasi ham o'zi joyiga tushadi.

### Birinchi ochganingizda

Admin bo'lib kiring va **Do'konlar** bo'limini oching. Brauzer
konsolida shunga o'xshash yozuv chiqadi:

```
Do'konlar bog'landi — yangi: 29 | bog'landi: 0 | yangilandi: 0 | birlashtirildi: 0
```

Keyingi safar `0` chiqadi — ya'ni ortiqcha ish qilmaydi, bulutga
ortiqcha yozuv ham ketmaydi.

---

## Bitta raqam — bitta magazin egasi

Ilgari solishtirish **aynan matn** bo'yicha edi. Shuning uchun bitta
odam uchun uchta hisob ochilib ketishi mumkin edi:

```
+998901112233        ┐
+998 90 111 22 33    ├─ ilgari: 3 xil hisob
90 111 22 33         ┘   endi:   1 hisob
```

Endi raqamlar bir ko'rinishga keltirilib solishtiriladi. Qayerda
ishlaydi:

- **Ro'yxatdan o'tishda** — shu raqam bor bo'lsa, hisob ochilmaydi.
  Agar raqam magazin egasiniki bo'lsa, xabar ham shunga mos chiqadi.
- **Kod tasdiqlash paytida** — kod kiritilayotganda boshqa qurilmadan
  shu raqam bilan hisob ochilgan bo'lsa, oxirgi lahzada ushlanadi.
- **Telegram raqami** ham hisobga olinadi.

### Xaritadan qo'shish bilan birlashtirildi

Xaritadan do'kon qo'shayotganda raqam allaqachon bor bo'lsa:

- shu raqamdagi **do'kon** bor → ikkinchisi ochilmaydi, **mavjudi**
  ochiladi
- shu raqamdagi **ro'yxatdan o'tgan egasi** bor → yangi karta o'sha
  egaga **avtomatik bog'lanadi**
- xaritadan sotish/buyurtma qilayotganda ham shunday: yozuv **mavjud**
  do'konga tushadi, ikkinchi qarz tarixi ochilmaydi

Ya'ni "xaritadan qo'shish" va "ro'yxatdan o'tish" — ikkalasi ham
**bitta kartaga** kelib qo'shiladi.

### Takroriy kartalar tozalanadi

Ilgari bir egaga 2-3 tadan karta tushib qolgan bo'lsa, ular
birlashtiriladi: buyurtma, qarz va cheklar **tarixi ko'proq** bo'lgan
karta qoldiriladi, qolgan kartalardagi hamma yozuv unga ko'chiriladi.
Hech qanday qarz yoki buyurtma yo'qolmaydi.

---

## Serverga yuklash

Zipni `public_html` ga **Extract** qiling.

Zipda **ataylab yo'q**: `bot/`, `qarz/`, `uploads/` va asosiy
`.htaccess` — serverdagilari o'z joyida qolsin.

Versiya `?v=145`, kesh `utam-v14-5`.

---

## Bir eslatma

Bu zip siz yuborgan **v14.4** ustiga qurildi. Men oldin yuborgan
**v14.2** (telefon raqamlar, chekni printerdagidek rasm qilish,
original sifatdagi rasm, yuklash kalitidagi xato) bu versiyada yo'q —
siz uni o'rnatmagan ko'rinasiz. Hozir hech narsani aralashtirmadim.
Agar o'sha ishlarni ham shu versiyaga ko'chirishim kerak bo'lsa — ayting.
