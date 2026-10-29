# Hosting tekshiruvi — telefondan, cPanel (hostmaster.uz)

Bu ro'yxat AI Sales HQ qaysi texnologiyada qurilishini hal qiladi. Hech narsani o'zgartirmaysiz, faqat **ko'rib, javobni yozib yuborasiz**. Taxminan 15 daqiqa.

**Javobni qanday yuborish:** har bir bo'lim oxiridagi "Javob" qatorini to'ldiring yoki ekranni rasmga oling (skrinshot). Hammasini bitta xabarda Claude'ga yuboring.

**Muhim:** parol, kalit, token yoki to'liq server manzillarini **yubormang** — ular kerak emas.

> cPanel'ga kirish: brauzerda `https://unutilmastam.uz:2083` yoki hostmaster.uz shaxsiy kabinetidan "cPanel" tugmasi.
> Telefonda menyu yashirin bo'lsa — yuqori chap burchakdagi **☰** belgisini bosing. Har bir bo'limni yuqoridagi **qidiruv (Search)** maydoniga nomini yozib ham topsa bo'ladi.

---

## 0. Qaysi hisob?

1. cPanel'ga kirgandan keyin o'ng tomonda (telefonda pastda) **"General Information"** bloki bor.
2. U yerda **"Primary Domain"** va **"Current User"** yozilgan.

- `itcode.uz` (SMY Agent) va `unutilmastam.uz` **bitta cPanel hisobidami** yoki alohida?
- **Javob:** `Bitta hisob / Alohida hisob` · Primary Domain: `________`

## 1. Node.js bormi? (eng muhim savol)

1. Qidiruvga yozing: **`Node`**.
2. **"Setup Node.js App"** belgisi chiqdimi?
   - **Chiqmasa** → javob "Node.js yo'q" deb yozing va 2-bo'limga o'ting.
   - **Chiqsa** → bosing → **"+ CREATE APPLICATION"** tugmasini bosing (hech narsa saqlamaymiz!).
3. **"Node.js version"** ro'yxatini oching va undagi **barcha versiyalarni** yozing (masalan 18.20, 20.x, 22.x).
4. Hech narsani saqlamasdan **"Cancel"** yoki orqaga qayting.

- **Javob:** `Setup Node.js App: bor / yo'q` · Versiyalar: `________`

Shu yerda yana qarang: qidiruvga **`Python`** yozing → **"Setup Python App"** bormi? Bor bo'lsa, xuddi shunday "CREATE APPLICATION" → **"Python version"** ro'yxatini yozing va bekor qiling.

- **Javob:** `Setup Python App: bor / yo'q` · Versiyalar: `________`

## 2. Ma'lumotlar bazasi

1. Qidiruvga **`MySQL`** yozing → **"MySQL® Databases"** bormi?
2. Qidiruvga **`phpMyAdmin`** yozing → oching. Bosh sahifada o'ngda **"Database server"** blokida **"Server version"** qatori bor (masalan `8.0.36 - MySQL Community Server` yoki `10.6.x-MariaDB`). Shu qatorni yozing.
3. Qidiruvga **`PostgreSQL`** yozing → **"PostgreSQL Databases"** belgisi bormi?
4. **"MySQL® Databases"** sahifasida yana nechta baza yaratish mumkinligi ko'rsatiladi (o'ng blok "Statistics" → **"Databases  X / Y"**). Shuni yozing.

- **Javob:** MySQL: `bor/yo'q`, versiya `________` · PostgreSQL: `bor/yo'q` · Bazalar: `__ / __`

## 3. Cron (har daqiqada ishga tushirish)

1. Qidiruvga **`Cron`** yozing → **"Cron Jobs"** ni oching.
2. **"Add New Cron Job"** bo'limida **"Common Settings"** ro'yxatini oching.
3. Ro'yxatda **"Once Per Minute (\* \* \* \* \*)"** bormi? Yoki eng kichigi "Once Per Five Minutes"mi?
4. Sahifa tepasida "minimal interval" haqida ogohlantirish yozuvi bo'lsa — uni ham yozing.
5. **Hech narsa qo'shmang**, faqat ko'ring.

- **Javob:** Eng kichik interval: `1 daqiqa / 5 daqiqa / 15 daqiqa / boshqa: ____`

## 4. Resurs chegaralari (xotira, jarayonlar)

1. Bosh sahifada o'ng blok **"Statistics"** ni pastga suring (yoki qidiruvga **`Resource Usage`** yozing).
2. Quyidagi qatorlarning **o'ng tomonidagi chegara** sonini yozing (masalan `0 / 1 GB`):
   - **Physical Memory Usage** (xotira)
   - **CPU Usage**
   - **Entry Processes**
   - **Number of Processes**
   - **I/O Usage**
   - **Disk Usage**
3. Eng osoni — shu blokni skrinshot qilib yuboring.

- **Javob:** Xotira: `____` · CPU: `____` · Entry Processes: `____` · Processes: `____` · Disk: `____`

## 5. Maksimal bajarilish vaqti

Bu qiymat cPanel'da ko'pincha ko'rinmaydi. Ikki yo'l:

**a)** Qidiruvga **`MultiPHP INI Editor`** yozing → oching → **"Basic Mode"** → domen sifatida `unutilmastam.uz` ni tanlang → **`max_execution_time`** va **`memory_limit`** qiymatlarini yozing (faqat ko'ring, saqlamang). Bu PHP uchun, lekin tarif darajasini ko'rsatadi.

**b)** hostmaster.uz qo'llab-quvvatlash xizmatiga quyidagi xabarni yuboring (pastdagi 8-bo'lim) — ular aniq javob beradi.

- **Javob:** `max_execution_time = ____` · `memory_limit = ____`

## 6. Tashqi internetga chiqish (HTTPS)

Server Google (Firestore), Telegram va AI xizmatlariga ulana olishi kerak. Buni support'dan so'rash eng ishonchli (8-bo'lim). Agar cPanel'da **"Terminal"** belgisi bo'lsa (qidiruvga `Terminal` yozing), u **serverda** ishlaydi — telefoningizda emas. Xohlasangiz, shu qatorni nusxa olib qo'ying va natijani yuboring:

```
for h in firestore.googleapis.com oauth2.googleapis.com api.telegram.org api.anthropic.com api.openai.com places.googleapis.com; do printf "%s " $h; curl -s -o /dev/null -w "%{http_code}\n" --max-time 10 https://$h; done
```

Har bir qator yonida 3 xonali son chiqsa (masalan `404`, `200`, `401`) — ulanish **bor**. `000` chiqsa — **yo'q**.

- **Javob:** `Terminal bor/yo'q` · natija: `________` (yoki "support'dan so'radim")

## 7. Subdomen va SSL

1. Qidiruvga **`Domains`** yozing → **"Domains"** sahifasi. `agent.unutilmastam.uz` kabi subdomen yaratish mumkinmi (**"Create A New Domain"** tugmasi bormi)? **Yaratmang**, faqat tugma borligini ayting.
2. Qidiruvga **`SSL/TLS Status`** yozing → `unutilmastam.uz` yonida yashil qulf (AutoSSL) bormi?
3. Qidiruvga **`Git`** yozing → **"Git™ Version Control"** bormi?
4. Muhim: `unutilmastam.uz` sayti hozir **qayerda** ochiladi — shu cPanel'danmi yoki Firebase Hosting'danmi? Bilmasangiz, "bilmayman" deb yozing.

- **Javob:** Subdomen: `mumkin/yo'q` · AutoSSL: `bor/yo'q` · Git: `bor/yo'q` · Sayt: `cPanel / Firebase / bilmayman`

## 8. Support'ga tayyor xabar (nusxa olib yuboring)

hostmaster.uz → shaxsiy kabinet → **Tiket / Support**:

> Assalomu alaykum. Mening hosting tarifim bo'yicha quyidagilarni aniqlab bera olasizmi:
> 1. "Setup Node.js App" mavjudmi va qaysi Node.js versiyalari bor (20 yoki 22 kerak)?
> 2. Passenger orqali ishlaydigan Node.js / Python ilova uchun bitta so'rovning maksimal vaqti (timeout) qancha?
> 3. Cron vazifalarining eng kichik intervali — har 1 daqiqada ishlatsa bo'ladimi?
> 4. Cron orqali ishga tushgan jarayon uchun maksimal ishlash vaqti va xotira (RAM) chegarasi qancha?
> 5. Serverdan tashqi HTTPS so'rovlar (firestore.googleapis.com, oauth2.googleapis.com, api.telegram.org, api.anthropic.com) ruxsat etilganmi?
> 6. MySQL server versiyasi qaysi, PostgreSQL bormi?
> Rahmat.

Ruscha variant (kerak bo'lsa):

> Здравствуйте. Подскажите, пожалуйста, по моему тарифу: 1) Доступен ли «Setup Node.js App» и какие версии Node.js (нужна 20 или 22)? 2) Максимальное время выполнения запроса для приложения на Passenger (Node.js/Python)? 3) Минимальный интервал cron — можно ли раз в 1 минуту? 4) Лимит времени и памяти для процесса, запущенного из cron? 5) Разрешены ли исходящие HTTPS-запросы к firestore.googleapis.com, oauth2.googleapis.com, api.telegram.org, api.anthropic.com? 6) Версия MySQL, есть ли PostgreSQL? Спасибо.

---

## Javoblar shabloni (nusxa olib to'ldiring)

```
0. Hisob: bitta/alohida, Primary Domain: ...
1. Node.js App: bor/yo'q, versiyalar: ...   Python App: bor/yo'q, versiyalar: ...
2. MySQL: versiya ...   PostgreSQL: bor/yo'q   Bazalar: .. / ..
3. Cron eng kichik interval: ...
4. Xotira: ... CPU: ... Entry Processes: ... Processes: ... Disk: ...
5. max_execution_time: ...  memory_limit: ...  (support javobi: ...)
6. Tashqi HTTPS: ...
7. Subdomen: ...  AutoSSL: ...  Git: ...  Sayt qayerda: ...
```
