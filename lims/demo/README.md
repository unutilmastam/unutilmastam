# Demo: mijozga ko'rsatish uchun video va rasmlar

Bu papkadagi skriptlar **ishlab turgan dasturni boshqarib** video yozib oladi
va ekran rasmlarini oladi. Chizma ham, montaj ham yo'q — ekranda ko'ringan
har bir raqam bazadan keladi.

Natija: `LabCore-TANISHTIRUV.html` — bitta faylda 6 ta video va 30 ta rasm.

## Nima kerak

```bash
npm install --no-save playwright        # brauzerni boshqarish
apt-get install -y ffmpeg               # webm -> mp4
```

Chromium `/opt/pw-browsers/chromium-*/chrome-linux/chrome` da bo'lishi kerak
(`demo-yoz.mjs` dagi `CHROME` o'zgaruvchisi).

## Qanday ishlatiladi

```bash
# 1. Demo bazani boshidan yig'ish (12 bemor, buyurtmalar, natijalar,
#    analizatorlar, kameralar). 4950-portda server ko'tariladi.
bash demo/demo-qur.sh

# 2. Video va rasmlarni yozib olish -> /tmp/demo-chiqish
node demo/demo-toliq.mjs

# 3. webm -> mp4
cd /tmp/demo-chiqish/video && mkdir -p mp4
for f in *.webm; do
  ffmpeg -y -i "$f" -c:v libx264 -preset slow -crf 26 -pix_fmt yuv420p \
    -movflags +faststart "mp4/${f%.webm}.mp4"
done

# 4. Bitta faylga yig'ish
python3 demo/taqdimot-qur.py /tmp/LabCore-TANISHTIRUV.html
```

## Fayllar

| Fayl | Nima qiladi |
|---|---|
| `demo-qur.sh` | Butun demo bazani boshidan yig'adi |
| `demo-seed.mjs` | Bemorlar, buyurtmalar, natijalar, to'lovlar, navbat, ombor |
| `avatar.mjs` | Xodim rasmlarini yasaydi |
| `rasm-pin.mjs` | Rasmlarni yuklaydi va PIN kodlarni qo'yadi |
| `parol.mjs` | Boshlang'ich parollarni almashtiradi |
| `uskuna-kamera.mjs` | Analizatorlar va kameralar; HL7 xabari yuboriladi |
| `kamera-hodisa.mjs` | Yuz yorliqlari va davomat hodisalari |
| `demo-yoz.mjs` | Yordamchi: ekran yozuvi, kursor animatsiyasi, video yozish |
| `demo-toliq.mjs` | Sahnalar: nima ko'rsatiladi va qanday tartibda |
| `taqdimot-qur.py` | Rasm va videolarni bitta HTML faylga joylaydi |

## Muhim

Demo bazasi **`labcore_demo`** — ishlab turgan bazaga tegmaydi.
`demo-qur.sh` uni har safar o'chirib, yangidan yaratadi.

Ma'lumotlar o'ylab topilgan: haqiqiy bemor ma'lumoti ishlatilmaydi.
