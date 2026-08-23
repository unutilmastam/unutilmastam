# 💰 Qarz Daftar — qo'llanma

Bitta HTML fayl. Internet talab qilmaydi, hamma narsa qurilmangizda saqlanadi.
Ochish: `debt-manager.html` faylini brauzerda oching (telefonda ham ishlaydi).

---

## Asosiy tushunchalar

| Tushuncha | Ma'nosi |
|---|---|
| **Menga qarzdor** | Siz qarz **berdingiz**, sizga qaytarishlari kerak |
| **Men qarzdorman** | Siz qarz **oldingiz**, siz qaytarishingiz kerak |
| **Sof balans** | Menga qarzdor − Men qarzdorman |
| **Chek** | To'lov kvitansiyasi rasmi (isbot uchun saqlanadi) |

---

## 1. Qarz qo'shish

**➕ Yangi qarz** tugmasi (yoki telefonda pastdagi katta `+`).

1. **Qarz turi** — Menga qarzdor / Men qarzdorman
2. **Kim bilan** — Odam yoki **Bank** (bank alohida ikonka bilan ko'rinadi)
3. **Ism** — bir marta yozsangiz, keyingi safar avtomatik taklif qilinadi
4. **Summa** — yozganingizda o'zi `5 000 000` ko'rinishida ajratiladi
5. **Valyuta** — so'm yoki dollar
6. **Olingan sana** va **Qaytarish muddati** (muddat kechiksa — qizil ogohlantirish)
7. **Kredit jadvali va kechikish penisi** — pastdagi bo'limni oching (⬇ tugma)
8. **Telefon** — detal oynasidan bir bosishda qo'ng'iroq qilish uchun
9. **Izoh** — nima uchun olingani

Tez tugmalar: `+ 100 ming`, `+ 500 ming`, `+ 1 mln`, `+ 5 mln` — summani tez yig'ish uchun.

---

## 1a. Kredit jadvali va peni ⭐

Formadagi **"Kredit jadvali va kechikish penisi"** bo'limini oching:

| Maydon | Ma'nosi |
|---|---|
| **Har oy to'lash sanasi** | Masalan `15-sana` — har oyning 15-sanasida to'lov kutiladi |
| **Oylik to'lov** | Har oy to'lanishi kerak bo'lgan summa |
| **Kechiksa — peni foizi** | Muddat o'tgach qo'shiladigan foiz (masalan `0.2`) |
| **Foiz davri** | `har kuni` yoki `har oy` |

Ilova o'zi to'lov jadvalini tuzadi. Masalan **24 000 000 so'm**, har oy **15-sana**, oyiga
**4 000 000** → 6 oylik jadval: 15-fev, 15-mar, 15-apr, 15-may, 15-iyn, 15-iyl.

### Peni qanday hisoblanadi

Sana o'tib ketsa va to'lov qilinmasa, **to'lanmagan summaga** har kuni foiz qo'shilib boradi.
Muhimi: peni **o'sib boradi** — har yangi to'lov sanasi o'tgan sari kechikkan summa kattalashadi,
demak kunlik peni ham kattalashadi.

**Misol** (peni 0.2% kuniga, bugun 4-avgust, faqat 2 oy to'langan):

| Davr | Kechikkan qoldiq | Kun | Peni |
|---|---|---|---|
| 15 apr → 15 may | 4 mln | 30 | 240 000 |
| 15 may → 15 iyn | 8 mln | 31 | 496 000 |
| 15 iyn → 15 iyl | 12 mln | 30 | 720 000 |
| 15 iyl → 4 avg | 16 mln | 20 | 640 000 |
| **Jami** | **16 mln** | **111 kun** | **2 096 000** |

→ Jami to'lash kerak: `16 000 000 + 2 096 000 = 18 096 000 so'm`

Qarzni ochsangiz, shu jadvalning hammasi ko'rinadi: kechikkan summa, necha kun kechikkani,
hisoblangan peni, jami to'lash kerak bo'lgan summa va hisob formulasi.

> **Muhim:** peni faqat **kechikkan** qismga hisoblanadi, butun qarzga emas.
> Oldindan to'lasangiz, ortiqcha summa keyingi oylarga o'tadi va peni hisoblanmaydi.
> Peni foizini bo'sh qoldirsangiz — faqat kechikish ko'rsatiladi, peni hisoblanmaydi.

### Oddiy qarzlar uchun

Bank krediti bo'lmasa ham ishlaydi: shunchaki **Qaytarish muddati** ni qo'ying va istasangiz
peni foizini belgilang. Muddat o'tsa — o'sha kundan boshlab peni yurib boradi.

---

## 2. To'lov + CHEK qo'shish ⭐

Qarz **bo'lib-bo'lib** to'lanadi. Har bir to'lovga chek biriktirasiz.

**To'lov + chek** tugmasini bosing:

1. **Qaysi qarz** — ro'yxatdan tanlang. Tanlaganingizda darhol ko'rinadi:
   `Umumiy` / `To'langan` / `Qolgan` + foiz chizig'i
2. **To'lov summasi** — yoki tez tugmalar: **Yarmi** / **To'liq qolgani**
3. **Sana**
4. **Chek / kvitansiya rasmi:**
   - 📷 **Kamera** — telefonda to'g'ridan-to'g'ri chekni suratga oladi
   - 🖼 **Galereya** — tayyor rasmni tanlaydi
   - Bitta to'lovga **6 tagacha** chek
   - Rasm avtomatik siqiladi (1200px, JPEG) — xotira tejaladi
   - Xato qo'shsangiz — rasm ustidagi ✕ tugmasi bilan o'chiring
5. **Izoh** — masalan "Karta orqali o'tkazildi"

**To'lovni yozish** bosilgach:
- Qolgan summa avtomatik kamayadi
- Qarz to'liq to'lansa — "to'liq yopildi" deb ovoz bilan aytadi
- Chek tarixda va qarz detalida rasm bo'lib saqlanib qoladi

> **Chekni ko'rish:** kichik rasm ustiga bossangiz to'liq ekranda ochiladi.
> O'ng yuqoridagi ⬇ tugmasi bilan chekni telefoningizga yuklab olasiz.

---

## 3. Bo'limlar

| Bo'lim | Nima bor |
|---|---|
| **Bosh sahifa** | 3 ta yig'indi karta, "Diqqat talab qiladi" (kechikkanlar birinchi), so'nggi harakatlar |
| **Qarzlar** | Qidiruv + filtrlar: Hammasi / Menga / Men / **Bank** / **Muddati o'tgan** / Yopilgan |
| **Ogohlantirish** | Ilova ochilganda kechikkan to'lovlar va yaqinlashgan sanalar haqida xabar beradi |
| **Odamlar** | Har bir shaxs bo'yicha jamlanma: nechta qarz, nechta chek, sof qoldiq |
| **Tarix** | Har bir harakat. Filtr: To'lovlar / Qarzlar / **Chekli** |
| **Statistika** | 6 ta ko'rsatkich, doiraviy diagramma, eng katta qarzdorlar |
| **Sozlamalar** | Zaxira nusxa, tiklash, hammasini o'chirish |

---

## 4. Qarz detali

Ro'yxatdagi istalgan qarzni bosing:

- Umumiy / To'langan / Qolgan + foiz chizig'i
- **Kechikish bloki** — kechikkan summa, kunlar, peni, jami to'lash kerak, hisob formulasi
- **To'lov jadvali** — kechikkanlar qizil, keyingisi ko'k rangda
- Telefon raqami (bosilsa — qo'ng'iroq)
- **To'lovlar tarixi** — har bir to'lov, sanasi, izohi va **chek rasmlari**
- Har bir to'lovni alohida o'chirish mumkin (🗑)
- Pastda: **Tahrirlash** va **O'chirish**

---

## 5. Ovozli boshqaruv 🎤

O'ng yuqoridagi mikrofon tugmasini bosing va gapiring. Ilova **javobni ovoz bilan aytadi**.

| Ayting | Natija |
|---|---|
| "yangi qarz" | Qarz oynasini ochadi |
| "to'lov" / "chek" | To'lov oynasini ochadi |
| "balans" | Sof balansni ovoz bilan aytadi |
| "menga qancha" | Sizga qancha qarzdorligini aytadi |
| "men qancha" | Sizning qarzingizni aytadi |
| "peni" / "jarima" | Kechikkan qarzlar va jami penini aytadi |
| "qarzlar" / "tarix" / "statistika" / "odamlar" | Shu bo'limga o'tadi |
| "qorong'i" / "yorug'" | Tungi/kunduzgi rejim |

> Mikrofonga ruxsat so'raydi — bir marta "Ruxsat berish"ni bosing.
> Chrome va Safari'da ishlaydi.

---

## 6. Tungi rejim 🌙

O'ng yuqoridagi oy/quyosh tugmasi. Tanlovingiz eslab qolinadi.
Birinchi ochilganda telefoningiz rejimiga moslashadi.

---

## 7. Ma'lumotlarni saqlash

**Standart holat — faqat qurilmada:**
- Hammasi **shu qurilmada** (localStorage) saqlanadi — hech qayerga yuborilmaydi
- **Sozlamalar → Zaxira nusxa (JSON)** — hamma qarz, to'lov va **cheklar** bitta faylga tushadi
- Boshqa telefonga o'tkazish: shu faylni oling → yangi qurilmada **Zaxiradan tiklash**
- Brauzer ma'lumotlarini tozalasangiz — yo'qoladi. Vaqti-vaqti bilan zaxira oling.

**☁️ Bulutda saqlash (tavsiya etiladi):**
- **Sozlamalar → Bulutda saqlash** bo'limidan Firebase Firestore'ga ulanasiz
- Ulangach: telefon yo'qolsa ham ma'lumot yo'qolmaydi, boshqa qurilmada ham ko'rinadi
- O'zgarishlar **real vaqtda** sinxronlanadi
- Internet yo'q bo'lsa ham ilova ishlayveradi, ulanish tiklanganda o'zi sinxronlanadi
- To'liq o'rnatish qo'llanmasi: **[FIREBASE-SETUP.md](FIREBASE-SETUP.md)**

Yuqoridagi bulut belgisi holatni ko'rsatadi:
`Ulanmagan` / `Kirilmagan` / `Ulangan` ✓ / `Sinxronlanmoqda…` / `Xato`

---

## 8. Tezkor tugmalar (kompyuterda)

| Tugma | Vazifa |
|---|---|
| `Ctrl` + `K` | Qidiruvga o'tish |
| `Esc` | Ochiq oynani yopish |

---

## Misol ssenariy

**1-kun.** Ozoda opaga 5 000 000 so'm berdim, muddat — 20-iyul.
→ Yangi qarz → *Menga qarzdor* → Ozoda opa → 5 000 000 → muddat 20.07

**10-kun.** Ozoda opa 2 000 000 qaytardi, kvitansiya berdi.
→ To'lov + chek → Ozoda opa → **Yarmi** emas, 2 000 000 → 📷 Kamera bilan kvitansiyani suratga oldim → Yozish

**Natija:** qarz `40% to'langan`, qolgan `3 000 000 so'm`, chek tarixda rasm bo'lib turibdi.

**20-iyuldan keyin** qarz avtomatik `⚠ N KUN KECH` bo'lib qizil rangda bosh sahifaning eng tepasiga chiqadi.

---

## Savol-javob

**Chek rasmlari joyni ko'p egallaydimi?**
Yo'q — har bir rasm avtomatik ~100-200 KB gacha siqiladi. Sozlamalarda umumiy hajm ko'rsatilgan.

**Xotira to'lib qolsa?**
Ilova ogohlantiradi. Eski to'lovlarni yoki yopilgan qarzlarni o'chiring (avval zaxira oling).

**Internet kerakmi?**
Yo'q. Shrift internetdan yuklanadi, lekin u ilovani bloklamaydi — internet bo'lmasa
tizim shrifti bilan darhol ochiladi.

**Peni noto'g'ri hisoblanyaptimi deb o'ylasam?**
Qarz detalida hisob formulasi va har bir to'lov sanasi ko'rsatilgan — o'zingiz tekshira olasiz.
Peni faqat kechikkan qismga, kechikkan kunlar soniga ko'paytiriladi.

**Bir odamda bir nechta qarz bo'lsa?**
Bemalol — har birini alohida qo'shing. "Odamlar" bo'limi ularni yig'ib, sof qoldiqni ko'rsatadi.
