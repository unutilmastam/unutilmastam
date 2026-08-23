# ☁️ Firebase Firestore'ga ulash — bosqichma-bosqich

Bu qo'llanma **10-15 daqiqa** oladi. Hech qanday dasturlash kerak emas.
Firebase'ning bepul rejasi shaxsiy foydalanish uchun yetarli.

Ulangandan keyin: qarzlar, to'lovlar va **cheklar bulutda** saqlanadi. Telefon
yo'qolsa ham ma'lumot yo'qolmaydi, boshqa qurilmada ham xuddi shu ma'lumot ko'rinadi.

> **Muhim:** ulanmasangiz ham ilova to'liq ishlayveradi — ma'lumot qurilmangizda saqlanadi.
> Bulut — qo'shimcha himoya qatlami.

---

## 1-qadam. Firebase loyihasini yaratish

1. https://console.firebase.google.com ga kiring (Google hisobingiz bilan)
2. **Add project** (yoki "Loyiha qo'shish") ni bosing
3. Loyihaga nom bering — masalan `qarz-daftar`
4. Google Analytics'ni **o'chirib qo'ysangiz ham bo'ladi** (kerak emas)
5. **Create project** → biroz kuting

---

## 2-qadam. Web ilova qo'shish va konfiguratsiyani olish

1. Loyiha bosh sahifasida **`</>`** (Web) belgisini bosing
2. Ilovaga nom bering — masalan `Qarz Daftar`
3. "Firebase Hosting" katagini belgilamasangiz ham bo'ladi
4. **Register app** ni bosing
5. Ekranda shunday matn chiqadi:

```js
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "qarz-daftar.firebaseapp.com",
  projectId: "qarz-daftar",
  storageBucket: "qarz-daftar.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

6. **Shu matnni to'liq nusxalang** (import satrlari bilan birga bo'lsa ham mayli —
   ilova o'zi kerakli qismini ajratib oladi)

---

## 3-qadam. Authentication'ni yoqish

1. Chap menyudan **Build → Authentication** ni tanlang
2. **Get started** ni bosing
3. **Sign-in method** bo'limida **Email/Password** ni tanlang
4. Birinchi tugmani **Enable** qiling (ikkinchisi — "Email link" — kerak emas)
5. **Save**

> Bu qadamni o'tkazib yuborsangiz, kirishda
> *"Firebase konsolida Email/Password usulini yoqing"* degan xato chiqadi.

---

## 4-qadam. Firestore bazasini yaratish

1. Chap menyudan **Build → Firestore Database** ni tanlang
2. **Create database** ni bosing
3. Joylashuv (location): `eur3` yoki `europe-west` — O'zbekistonga yaqinroq
4. **Production mode** ni tanlang (xavfsizroq — qoidalarni keyingi qadamda qo'yamiz)
5. **Create**

---

## 5-qadam. Xavfsizlik qoidalarini qo'yish ⚠️

Bu **eng muhim qadam**. Qoidasiz har kim sizning qarzlaringizni o'qiy oladi.

1. Firestore Database → **Rules** yorlig'iga o'ting
2. Borini o'chirib, shu repodagi **`firestore.rules`** faylining mazmunini qo'ying:

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == uid;
      }
    }
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

3. **Publish** ni bosing

Bu qoida: har bir foydalanuvchi **faqat o'zining** ma'lumotini ko'radi va yozadi.
Boshqa hech kim — hatto boshqa ro'yxatdan o'tgan foydalanuvchi ham — ko'ra olmaydi.

---

## 6-qadam. Ilovada ulash

1. Ilovani oching → **Sozlamalar**
2. **Bulutda saqlash** kartasida **"1-qadam: Firebase konfiguratsiyasi"** ni bosing
3. 2-qadamda nusxalagan matnni katakka tashlang → **Saqlash**
4. Bir necha soniyada **"2-qadam: Hisobga kirish"** paydo bo'ladi
5. Email va parol yozing (kamida 6 belgi) → **Ro'yxatdan o'tish**
6. Yuqorida yashil **"Ulangan"** belgisi chiqadi ✓

Boshqa telefonda ham xuddi shu konfiguratsiyani qo'yib, **o'sha email/parol bilan
"Kirish"** ni bossangiz — barcha ma'lumot o'sha yerda paydo bo'ladi.

---

## Qanday ishlaydi

| Holat | Nima bo'ladi |
|---|---|
| Internet bor, kirgansiz | Har bir o'zgarish darhol bulutga yoziladi va boshqa qurilmalarda real vaqtda ko'rinadi |
| Internet yo'q | Ilova qurilma xotirasida ishlayveradi; internet kelganda avtomatik sinxronlanadi |
| Ikki qurilmada bir vaqtda o'zgartirsangiz | Oxirgi o'zgarish g'olib bo'ladi (har yozuvda vaqt belgisi bor) |
| Qurilmada o'chirsangiz | Bulutda ham o'chadi (va aksincha) |

**Saqlanadigan joylar:**
```
users/{sizning-uid}/debts/{qarz}     — qarzlar
users/{sizning-uid}/pays/{tolov}     — to'lovlar
users/{sizning-uid}/cheks/{chek}     — chek rasmlari (alohida, hajm cheklovi uchun)
```

Cheklar alohida hujjatlarda saqlanadi, chunki Firestore'da bitta hujjat
**1 MB** dan oshmasligi kerak — chek rasmlari esa kattaroq bo'lishi mumkin.

---

## Xatolar va yechimlari

| Xato | Sababi va yechimi |
|---|---|
| "Firebase kutubxonasi yuklanmadi" | Internet yo'q yoki brauzer bloklayapti. Internetni tekshiring |
| "Firebase konsolida Email/Password usulini yoqing" | 3-qadam bajarilmagan |
| "Firestore bazasi yaratilmagan" | 4-qadam bajarilmagan |
| "Firestore qoidalari ruxsat bermadi" | 5-qadam bajarilmagan yoki noto'g'ri qo'yilgan |
| "Bu email allaqachon ro'yxatdan o'tgan" | "Ro'yxatdan o'tish" emas, **"Kirish"** ni bosing |
| "Email yoki parol noto'g'ri" | Parolni tekshiring |
| "Konfiguratsiya o'qilmadi" | Matnda `apiKey` va `projectId` borligiga ishonch hosil qiling |

---

## Xarajat

Firebase bepul rejasi (Spark):

- Firestore: **1 GB** saqlash, kuniga **50 000** o'qish / **20 000** yozish
- Authentication: cheksiz email/parol foydalanuvchi

Shaxsiy qarz daftari uchun bu **juda yetarli**. Har bir chek ~150 KB, ya'ni
1 GB ga taxminan **6000 ta chek** sig'adi.

---

## Xavfsizlik haqida

- `apiKey` **maxfiy emas** — u ilovani identifikatsiya qiladi, himoyani emas.
  Haqiqiy himoya — 5-qadamdagi **qoidalar** va parolingiz.
- Shuning uchun `apiKey` ni GitHub'ga qo'yish xavfli emas. Lekin bu ilovada u
  umuman kodda emas — brauzeringizda saqlanadi.
- **Parolingizni hech kimga bermang** — u bilan barcha qarz ma'lumotingiz ochiladi.
