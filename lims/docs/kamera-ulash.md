# Kameralarni ulash va davomat nazorati

LabCore kameraning o'zi bilan video ishlamaydi — **yuzni tanish AI kamerada
yoki NVR'da ishlaydi**, LabCore esa undan tayyor hodisa oladi:
"falonchi, falon vaqtda, falon kamerada ko'rindi". Shu hodisalar asosida
xodimning ish joyida bo'lgan vaqti hisoblanadi.

Shunday bo'lgani ma'qul: video oqimni qayta ishlash alohida server va
videokarta talab qiladi, zamonaviy NVR va IP-kameralarda esa yuz tanish
allaqachon bor.

---

## 1. Nima kerak

| Variant | Nima qiladi |
|---|---|
| **Yuz tanish qo'llab-quvvatlaydigan NVR** (Hikvision, Dahua, Uniview va h.k.) | Eng oson yo'l: NVR yuzlarni o'zi taniydi, LabCore'ga xabar yuboradi |
| **AI qutisi / kompyuter** (masalan Frigate, DeepStack, o'zingiz yozgan skript) | RTSP oqimni o'qiydi, yuz tanidi, LabCore'ga POST qiladi |
| **Faqat kamera** | Jonli kadr ko'rinadi, lekin davomat hisoblanmaydi |

---

## 2. Kamerani panelga qo'shish

**Boshqaruv → Kameralar → + Kamera qo'shish**

| Maydon | Misol | Izoh |
|---|---|---|
| Nomi | `Laborant xonasi` | hodisalarda shu nom ko'rinadi |
| Joylashuvi | `1-qavat` | |
| Qaysi ish joyini ko'radi | `LAB-PC-02` | ish stansiyasi nomi bilan bog'lash |
| Video oqim (RTSP) | `rtsp://192.168.1.50:554/Streaming/Channels/101` | VLC/NVR uchun |
| Kadr manzili (JPEG) | `http://192.168.1.50/ISAPI/Streaming/channels/101/picture` | panelda jonli kadr |
| Login / parol | `admin` / `••••` | parol shifrlangan holda saqlanadi |

Panelda har bir kamera uchun **5 soniyada yangilanadigan kadr** ko'rinadi.

> Brauzer RTSP oqimini to'g'ridan-to'g'ri ocha olmaydi — bu brauzerning
> cheklovi. Shuning uchun panelda kadr ko'rsatiladi; to'liq video uchun
> RTSP manzili VLC yoki NVR dasturida ochiladi.

---

## 3. AI'ni LabCore'ga ulash

Kamera qo'shilganda **kalit** beriladi. Yuz tanish tizimi hodisani shu
manzilga yuboradi:

```http
POST http://192.168.1.10:4000/api/cameras/events
X-Camera-Token: <kamera kaliti>
Content-Type: application/json

{
  "type": "face",
  "face_label": "Dilnoza",
  "confidence": 96.4,
  "at": "2026-08-04T09:15:00Z"
}
```

Bir nechta hodisani birdan yuborish (tarmoq tejaladi):

```json
{ "events": [ {...}, {...}, {...} ] }
```

Hodisa turlari:

| `type` | Ma'nosi |
|---|---|
| `face` | yuz tanildi (asosiy tur) |
| `present` | ish joyida (harakat/odam bor) |
| `absent` | ish joyida yo'q — oraliqni darhol yopadi |
| `motion` | harakat (davomatga kirmaydi) |
| `tamper` | kamera burab qo'yildi / yopildi |
| `offline` | kamera bilan aloqa uzildi |

`at` berilmasa hozirgi vaqt olinadi. Kalit noto'g'ri bo'lsa 401 qaytadi.

---

## 4. Yuz yorlig'ini xodimga bog'lash

AI o'z nomini yuboradi (`Dilnoza`, `person_17`, `EMP-003` — qanday sozlangan
bo'lsa). **Kameralar → Yuz yorliqlari** oynasida bu yorliq tizimdagi xodimga
bog'lanadi.

Bog'lanmagan yorliqlar alohida ro'yxatda ko'rinadi — AI yubora boshlagan
zahoti u yerda paydo bo'ladi. Bog'langanda **eski hodisalar ham** o'sha
xodimga o'tadi, ya'ni davomat orqaga qarab to'liq bo'ladi.

---

## 5. Davomat qanday hisoblanadi

Hodisalar uzluksiz kelmaydi — harakat bo'lganda keladi. Shuning uchun
ketma-ket hodisalar orasidagi tanaffus **10 daqiqadan** kichik bo'lsa, ular
bitta "ish joyida edi" oralig'iga birlashtiriladi (`PRESENCE_GAP_MINUTES`
orqali o'zgartiriladi).

Misol:

```
08:55 … 12:25  →  3 s 30 d   (31 ta hodisa)
12:25 → 13:20  →  tanaffus 55 daqiqa
13:20 … 17:04  →  3 s 44 d   (33 ta hodisa)
Jami kamerada: 7 s 14 d
```

**Davomat** bo'limida har bir xodim uchun ikkita raqam yonma-yon turadi:

* **Kamerada ko'rindi** — yuz tanish asosidagi vaqt;
* **Tizimda ishladi** — LabCore sessiyasi (kirdi/chiqdi) asosidagi vaqt.

Ikkalasi bir-birini tekshiradi: tizimda 8 soat, kamerada 3 soat bo'lsa —
savol tug'iladi.

### Muhim ogohlantirish

"Kamerada ko'rinmadi" **"ishlamadi" degani emas.** Xodim omborda, boshqa
xonada yoki kamera ko'rmaydigan burchakda bo'lishi mumkin. Bu raqam —
suhbat uchun asos, jazo uchun dalil emas. Shu sababli interfeysda ham
"ish vaqti" emas, "kamerada ko'rindi" deb yozilgan.

---

## 6. Maxfiylik va qonuniylik

Bu bo'lim tavsiya emas, **talab**:

1. **Kamera bemor hududiga qaratilmasin.** Qabul xonasi, namuna olish joyi,
   natijalar ko'rinib turgan monitorlar — bularni suratga olish tibbiy
   maxfiylikni buzadi.
2. **Xodimlar xabardor bo'lsin.** Ish shartnomasida yoki alohida hujjatda
   kuzatuv borligi, maqsadi va saqlash muddati yozilishi kerak. Ko'p
   mamlakatlarda bu qonun talabi; yashirin kuzatuv esa taqiqlanadi.
3. **Ko'rinadigan joyga ogohlantirish belgisi** osilsin.
4. **Hojatxona, dam olish xonasi, kiyinish xonasi** — hech qachon.
5. **Saqlash muddati.** Hodisalar `CAMERA_RETENTION_DAYS` (odatda 90 kun)
   dan keyin avtomatik o'chiriladi. Kerak bo'lsa qisqartiring.
6. **Faqat administrator ko'radi.** Laborant, shifokor, kassir kamera
   bo'limiga umuman kira olmaydi (test bilan tekshirilgan).
7. Davomatni ochish ham audit jurnaliga yoziladi — kim, qachon ko'rgani
   qoladi.

---

## 7. Sozlamalar (`.env`)

```
PRESENCE_GAP_MINUTES=10     # hodisalar orasidagi tanaffus chegarasi
CAMERA_RETENTION_DAYS=90    # hodisalarni saqlash muddati
```

Eski hodisalarni qo'lda tozalash: **Kameralar → hodisalar → tozalash**
yoki `POST /api/cameras/purge`.
