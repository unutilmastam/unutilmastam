# 💰 Qarz Boshqaruv Ilova - Foydalanuvchi Qo'llanmasi

## 🚀 Ilova Manzili
```
http://localhost:8000/debt-manager.html
```

---

## 📊 Dashboard (Bosh sahifa)

Sahifani birinchi ochganingizda 3 ta asosiy statistika ko'rasiz:

### 1. **💵 Menga Qarzdor**
- Boshqalar sizga berayotgan jami qarz
- **Narsani ko'rsatadi**: Sizga qaytarish kerak bo'lgan summa
- **Misol**: Agar Ozoda 500,000 сўм qarzdor bo'lsa → +500,000 сўм

### 2. **💸 Men Qarzdor**
- Siz boshqalarga berayotgan jami qarz
- **Narsani ko'rsatadi**: Siz to'lashingiz kerak bo'lgan summa
- **Misol**: Agar Fatima siz 300,000 сўм qarzdor bo'lsangiz → -300,000 сўм

### 3. **⚖️ Balans**
- Saf balansingiz (Menga qarzdor - Men qarzdor)
- **Musbat balans** = Siz musbat pozitsiyada
- **Manfiy balans** = Siz manfiy pozitsiyada

---

## ➕ Yangi Qarz Qo'shish

### Tugmani bosing: **➕ Yangi Qarz**

**Form Maydonlari:**

| Maydoni | Tashrihi | Misol |
|---------|---------|-------|
| **Odamning Ismi** | Qarz berayotgan yoki olyapturgan odam | Ozoda, Fatima |
| **Qarz Turi** | Iki opsiya: | - Menga qarzdor (Qarz berayotganman) |
| | | - Men qarzdor (Qarz olyaptirganman) |
| **Qarz Miqdori** | Summa (sonlar) | 500000, 1000000 |
| **Sana** | Qarz berilgan/olingan sana | 2026-08-04 |
| **Izoh** | (ixtiyoriy) Qarz haqida | Telefon sotib olishi uchun |

**Misol 1: Qarz Berish**
```
Ismi: Ozoda
Qarz Turi: Menga qarzdor
Miqdori: 500,000
Sana: 2026-08-04
Izoh: Telefon sotib olishi uchun
```

**Misol 2: Qarz Olish**
```
Ismi: Fatima
Qarz Turi: Men qarzdor
Miqdori: 300,000
Sana: 2026-08-01
Izoh: Kitob sotib olishi uchun
```

---

## 💳 To'lov Qo'shish

### Tugmani bosing: **💳 To'lov Qosh**

**Qachon ishlatamiz?** - Qarz qismi qaytarganingizda

### Form Maydonlari:

| Maydoni | Tashrihi |
|---------|---------|
| **Odam Tanlang** | Dropdown-dan odamni tanlang |
| **To'lov Miqdori** | Qaytarilgan summa |
| **Sana** | To'lov qilingan sana |
| **Izoh** | (ixtiyoriy) To'lov haqida |

**Misol:**
```
Odam: Ozoda
To'lov Miqdori: 200,000
Sana: 2026-08-04
Izoh: Birinchi part to'langan
```

---

## 📋 Tabs (Varaqlari)

### 1. **📊 Barcha Qarzlar**
- **Nima ko'rsatadi?** - Barcha qarzlar (menga va men)
- **Satrda nima?** - Odam ismi, qarz turi, qolgan summa
- **Tugmalar** - ✏️ Tahrirlash, 🗑️ O'chirish

### 2. **💵 Menga Qarzdor**
- Faqat sizga qaytarish kerak bo'lgan qarzlar
- Progress bar (ne qolaversa) ko'rsatadi

### 3. **💸 Men Qarzdor**
- Faqat siz to'lashingiz kerak bo'lgan qarzlar
- Progress bar (ne qolaversa) ko'rsatadi

### 4. **📅 Tarix**
- **Barcha hadisalar:** Qarz qo'shish, to'lov qilish
- **Tartibi:** Eng yangi birinchi
- **Ko'rsatadi:** Sana, noma, summa

### 5. **📈 Statistika**
- **O'rtacha Qarz (Menga)** - O'rtacha summa
- **O'rtacha Qarz (Mening)** - Siz berayotgan o'rtacha
- **Jami Tranzaksiya** - Barcha operatsiya soni
- **Ko'p Qarzdor Odamlar** - Top 5 ro'yxati

---

## 🎤 Ovozli Buyruqlar (Voice Commands)

### Tugmani bosing: **🎤**

**Aytish mumkin:**

| Buyruq | Nima bo'ladi |
|--------|-----------|
| "Yangi qarz" | Qarz qo'sh modal ochiladi |
| "To'lov" | To'lov modal ochiladi |
| "Qarzlar" / "Barcha" | Barcha qarzlar ko'rsatiladi |
| "Statistika" | Statistika paneli ochiladi |
| "Tarix" | Tarix ko'rsatiladi |

**Tilni o'zgartirish:** Uzbek (uz-UZ) tilida ishlaydi

---

## ⚙️ Qarzni Tahrirlash

### Qarz Satridagi ✏️ Tugmasini bosing

- Yangilash mumkin: Ismi, Miqdori, Sana, Izohni
- Saqlash: "Saqlash" tugmasini bosing

---

## 🗑️ Qarzni O'chirish

### Qarz Satridagi 🗑️ Tugmasini bosing

- **Tasdiqda** "O'chir" tugmasini bosing
- **E'tibor:** Barcha to'lovlar ham o'chib ketadi

---

## 💾 Ma'lumotlar Saqlash

- **Qayerda saqlanadi?** Browser Local Storage-da
- **Offline ishlaydi?** Ha! Internet yo'q bo'lsa ham ishlaydi
- **Boshqa kompyuterdagi ma'lumotlar?** Saqlanmaydi (xavfsizlik uchun)

---

## 🎨 Interfeys

- **Rang** - Gradient design (ko'k-purpur)
- **Ikonkalar** - Emoji + SVG
- **Qurilmalar** - Desktop, Tablet, Telefon
- **Tez** - Tez yuklash va ishlash

---

## ⚡ Misol Ssenariy

### Ssenariy: Dostlarning Qarzini Boshqarish

**Hafta 1:**
1. Ozoda 500,000 сўм beramiz → "Menga qarzdor" qo'shamiz
2. Fatima 300,000 сўм olyaptiradi → "Men qarzdor" qo'shamiz
3. **Dashboard:** Menga +500k, Men -300k, Balans +200k

**Hafta 2:**
1. Ozoda 200,000 сўм qaytaradi → "To'lov Qosh" (Ozoda, 200k)
2. Fatima 150,000 сўм beramiz → "To'lov Qosh" (Fatima, 150k)
3. **Dashboard:** Menga +300k qolgan, Men -150k qolgan

**Statistika Tekshirish:**
- Tab: "📈 Statistika" bosing
- O'rtacha qarzlarni ko'rish
- Eng ko'p qarzdor kim?

---

## ❓ Savol-Javoblar

**S: Qarz o'chirganda payment ham o'chadi?**
J: Ha, qarz o'chirilsa barcha to'lovlari ham o'chib ketadi.

**S: Offline ishlaydi?**
J: Ha! Ma'lumotlar browser-da saqlanadi.

**S: Ma'lumotlarni eksport qilsam bo'ladimi?**
J: Browser console-da `JSON.stringify(localStorage)` yozing.

**S: Boshqa telefondan ko'rsam?**
J: Har bir qurilmada alohida saqlash.

---

## 🚀 Tips & Tricks

1. **Tez qarz qo'shish:** Keyboard: Enter tugmasini bosing
2. **Ovozli buyruq:** "Yangi qarz" deyin va modal ochiladi
3. **Statistika:** Aylik qarzni tahlil qiling
4. **Export:** Console-dan ma'lumotlarni nusxalash

---

## 📱 Mobile Tips

- **Parmaklar bilan ishlaydi** - Barcha tugmalar o'lchamli
- **Popup modal** - Katta ekranlarda hamda mobilda ishlaydi
- **Responsive** - Har qanday o'lchamdagi ekranda moshib keladi

---

**Ilova hozir ishga tushuq! Foydalanib ko'ring va to'liq boshqaruvni o'zingizga.** 🎉
