# LabCore — Windows ish stansiyasi dasturi

Laborant, shifokor va kassa kompyuterlariga o'rnatiladigan dastur. U
laboratoriya serveridagi interfeysni ochadi, lekin brauzerdan farqli o'laroq:

* **Kompyuterning haqiqiy nomini yuboradi.** `os.hostname()` har bir so'rovga
  `X-Computer-Name` sarlavhasi bilan qo'shiladi — audit jurnalida `LAB-PC-02`
  aniq ko'rinadi va xodim uni o'zgartira olmaydi.
* **Server manzili bir marta sozlanadi.** Xodim har safar manzil terib
  o'tirmaydi; ulanish yo'qolsa tushunarli xabar va "qayta urinish" tugmasi chiqadi.
* **Chop etish va shtrix-kod skaneri** tizim darajasida ishlaydi
  (Ctrl+P — blanka/chek, F11 — to'liq ekran, F5 — yangilash).

## Ishga tushirish (dasturchi rejimi)

```bash
cd lims/desktop
npm install
npm start            # server manzilini so'raydi, so'ng ilovani ochadi
```

Ish stansiyasi nomini sinash uchun: `LABCORE_STATION=LAB-PC-07 npm start`

## Windows uchun o'rnatuvchi yasash

```powershell
# Windows kompyuterida (eng ishonchli yo'l)
cd lims\desktop
npm install
npm run build:win            # dist\LabCore Setup 1.0.0.exe  (NSIS o'rnatuvchi)
npm run build:win-portable   # o'rnatishsiz ishlaydigan bitta .exe
```

Linux yoki macOS'da yasamoqchi bo'lsangiz `wine` kerak bo'ladi:

```bash
sudo apt install -y wine
npm run build:win
```

Tayyor `.exe` ni har bir ish stansiyasiga o'rnatasiz. Birinchi ochilganda
dastur server manzilini so'raydi (masalan `http://192.168.1.10:4000`),
"Ulanishni tekshirish" tugmasi serverga ping yuboradi va laboratoriya nomini
ko'rsatadi.

## Sozlamalar qayerda saqlanadi

`%APPDATA%\labcore-desktop\labcore.json` — faqat server manzili.
Login/parol va bemor ma'lumotlari bu yerda saqlanmaydi.

Manzilni keyin o'zgartirish: **Yordam → Server manzilini o'zgartirish**.

## Xavfsizlik

* `contextIsolation: true`, `nodeIntegration: false` — veb-interfeysga
  Windows tizimiga kirish imkoni berilmaydi.
* Preload orqali faqat ikkita funksiya ochiladi: server manzilini tekshirish
  va saqlash.
* Tashqi havolalar ilova ichida emas, tizim brauzerida ochiladi.
