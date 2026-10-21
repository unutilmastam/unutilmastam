/* Unutilmas Ta'm — 1-state
   Avtomatik ajratilgan modul. Tartib MUHIM: index.html dagi ketma-ketlikni buzmang. */

/* ==================== VAQTINCHALIK DIAGNOSTIKA ====================
   Bu bo'lim FAQAT hozirgi muammoni topish uchun qo'shildi. Har qanday
   kutilmagan JS xatosi bo'lsa, u yashirin qolmasdan ekranda ko'rinadi —
   shu orqali "bosilganda hech narsa bo'lmayapti" muammosining HAQIQIY
   sababini aniqlab olamiz. Muammo topilgach, bu bo'lim olib tashlanadi. */
let __diagShownOnce = false;

/* ==================== ICONS ==================== */
const ICONS = {
  logo: '<path d="M6 2.5v6.2a2.2 2.2 0 0 0 4.4 0V2.5"/><path d="M8.2 2.5v18"/><path d="M17 2.5c-1.6 0-2.6 2-2.6 5s1 5 2.6 5"/><path d="M17 2.5v18"/><path d="M20.5 5.2l.7 1.6.7-1.6-.7-1.6z" fill="currentColor" stroke="none"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  home: '<path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9.5a1 1 0 0 0 1 1h3.5v-5.5h3v5.5H17a1 1 0 0 0 1-1V10"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  box: '<path d="M21 8 12 3 3 8v8l9 5 9-5V8Z"/><path d="M3 8l9 5 9-5"/><path d="M12 13v8"/>',
  qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2M14 19h2v2M19 19h2v2"/>',
  pin: '<path d="M12 22s7-7.2 7-12.5A7 7 0 0 0 5 9.5C5 14.8 12 22 12 22Z"/><circle cx="12" cy="9.5" r="2.4"/>',
  send: '<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  navigation: '<path d="M3 11l18-8-8 18-2-8-8-2Z"/>',
  receipt: '<path d="M6 2h12v19l-2.5-1.5L13 21l-2.5-1.5L8 21l-2-1.5V2Z"/><path d="M9 7h6M9 11h6M9 15h4"/>',
  card: '<rect x="2.5" y="5" width="19" height="14" rx="2.4"/><path d="M2.5 10h19"/><path d="M6 15h4"/>',
  store: '<path d="M4 9.5 5 4h14l1 5.5"/><path d="M4 9.5a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.2-4 4-6 7.5-6s6.3 2 7.5 6"/>',
  users: '<circle cx="8.5" cy="8" r="3.2"/><path d="M2.5 20c1-3.4 3.3-5 6-5s5 1.6 6 5"/><circle cx="17" cy="8.5" r="2.6"/><path d="M16 12.8c2 .3 3.6 1.7 4.5 4.7"/>',
  cart: '<circle cx="9.5" cy="20.5" r="1.3"/><circle cx="18" cy="20.5" r="1.3"/><path d="M2.5 3h2.5l2.4 12.2a2 2 0 0 0 2 1.6h8.4a2 2 0 0 0 2-1.6L21.5 7H6"/>',
  phone: '<path d="M6 3h3l1.5 4.5-2 1.6a12 12 0 0 0 5.4 5.4l1.6-2L20 14v3a2 2 0 0 1-2.2 2A16 16 0 0 1 4 5.2 2 2 0 0 1 6 3Z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  check: '<path d="M4 12.5 9.5 18 20 6"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  camera: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8Z"/><circle cx="12" cy="13.5" r="3.6"/>',
  camOff: '<path d="M4 8h3l1.6-2.4h6.8L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18A1.5 1.5 0 0 1 20 19.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8Z"/><path d="M3 3l18 18"/>',
  upload: '<path d="M12 16V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 16.5V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2.5"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 8l4.5 4-4.5 4"/><path d="M19 12H9"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  shield: '<path d="M12 2.5 4.5 5.5v6c0 5 3.2 8.4 7.5 10 4.3-1.6 7.5-5 7.5-10v-6Z"/><path d="M9 12l2 2 4-4.5"/>',
  alert: '<path d="M12 3 22 20H2L12 3Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="17" r="1"/>',
  bowl: '<path d="M3 12h18a9 8 0 0 1-18 0Z"/><path d="M12 12V5"/><path d="M9 6.5 12 5l3 1.5"/>',
  edit: '<path d="M4 20.5 5 16.8 15.8 6a2 2 0 0 1 2.8 0l1.4 1.4a2 2 0 0 1 0 2.8L9.2 20 4 20.5Z"/><path d="M14 8l2 2"/>',
  paperclip: '<path d="M21 11.5 12.5 20a4 4 0 0 1-5.6-5.6L15 6.3a2.7 2.7 0 0 1 3.8 3.8L10.6 18a1.3 1.3 0 0 1-1.9-1.9l7-7"/>',
  mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5v3.5M9 21h6"/>',
  stopsq: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  videocam: '<rect x="2.5" y="6" width="13" height="12" rx="2.5"/><path d="M15.5 10.5 21 7.5v9l-5.5-3Z"/>',
  play: '<path d="M7 5.5v13l11-6.5z"/>',
  speaker: '<path d="M4 9v6h4l5 4V5L8 9H4Z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/>',
  calc: '<rect x="4" y="2.5" width="16" height="19" rx="2.5"/><path d="M7.5 6.5h9M7.5 11h2M11.5 11h2M15.5 11h2M7.5 15h2M11.5 15h2M15.5 15h2M7.5 19h2M11.5 19h2M15.5 19h2"/>',
  megaphone: '<path d="M3 11v2a2 2 0 0 0 2 2h1l2 5h2l-1.5-5H11l8 4V6l-8 4H6a2 2 0 0 0-2 2Z"/><path d="M15 17.5a3 3 0 0 0 1-4.2"/>',
  tag: '<path d="M20.5 12.5 12.6 20.4a2 2 0 0 1-2.8 0l-6.2-6.2a2 2 0 0 1 0-2.8L11.5 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.5Z"/><circle cx="16" cy="8" r="1.5"/>',
  download: '<path d="M12 3v12m0 0 4-4m-4 4-4-4"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"/>',
  heart: '<path d="M12 20.5s-7.5-4.6-9.8-9.4C.7 7.6 2.4 4.5 5.6 4C8 3.6 10 4.8 12 7c2-2.2 4-3.4 6.4-3C21.6 4.5 23.3 7.6 21.8 11.1c-2.3 4.8-9.8 9.4-9.8 9.4Z"/>',
  star: '<path d="M12 2.5l2.9 6.3 6.9.8-5.1 4.8 1.4 6.9L12 17.9l-6.1 3.4 1.4-6.9-5.1-4.8 6.9-.8Z"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V4.8A1.8 1.8 0 0 1 10.8 3h2.4A1.8 1.8 0 0 1 15 4.8V7"/><path d="M6 7l1 13a2 2 0 0 0 2 1.9h6a2 2 0 0 0 2-1.9L18 7"/><path d="M10 11v6M14 11v6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 13.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V20a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H4a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V4a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.9V10c.4.4.9.7 1.6.7H20a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z"/>',
  telegram: '<path d="M21.5 3.5 2.5 11l6 2.2M21.5 3.5 18 20.5l-9.3-7.3M21.5 3.5 8.7 13.2M8.7 13.2v6l3-3.4"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="1"/>',
  youtube: '<rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.5 9.5v5l4.3-2.5Z" fill="currentColor" stroke="none"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 6h6v6"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  scale: '<path d="M12 3v18M7 7l-4 6h8l-4-6ZM17 7l-4 6h8l-4-6Z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  shieldCheck: '<path d="M12 3 4.5 6v6c0 5 3.4 8 7.5 9 4.1-1 7.5-4 7.5-9V6L12 3Z"/><path d="M9 12l2.2 2.2L15.5 9.5"/>',
  block: '<circle cx="12" cy="12" r="9"/><path d="M5.5 5.5l13 13"/>',
  locate: '<circle cx="12" cy="12" r="9.2"/><path d="M12 5.2l3.6 10.6-3.6-2.4-3.6 2.4L12 5.2z" fill="currentColor" stroke="none"/>',
  chat: '<path d="M4 4.5h16A1.5 1.5 0 0 1 21.5 6v9A1.5 1.5 0 0 1 20 16.5H9L4.5 20v-3.8A1.5 1.5 0 0 1 2.5 15V6A1.5 1.5 0 0 1 4 4.5Z"/><path d="M7.5 9h9M7.5 12.2h6"/>',
}

/* ==================== STATE ==================== */
let state = null;

let currentUser = null;

 // null = guest; {role:'user'|'admin', id, name, contact}

/* ---- SESSIYA: sahifa yangilansa ham kirgan holat saqlanadi ---- */
const SESSION_KEY = 'utam_session_v1';

const STORAGE_KEY = 'unutilmas-tam-v2';

// ESLATMA: Admin kirish kodi endi state.adminSettings.code ichida saqlanadi (admin uni o'zi o'zgartira oladi).
// Bu qiymat faqat ilova birinchi marta ishga tushganda (hali saqlangan holat bo'lmaganda) standart kod sifatida ishlatiladi.
const ADMIN_CODE = 'TAM-2026';

/* ==================== MAHSULOT TURLARI (kategoriyalar) ==================== */
const INITIAL_CATEGORIES = [
  {id:'pishiriq', name:'Pishiriqlar'},
  {id:'shirinlik', name:'Shirinliklar'},
  {id:'xamir', name:"Yarim tayyor xamir mahsulotlari"},
  {id:'gosht', name:"Yarim tayyor go'shtli mahsulotlar"},
];

let addCategoryContext = null;

/* ================================================================
   MA'LUMOTLAR OMBORI: Firestore (bulut, abadiy) + localStorage (oflayn kesh)
   FIREBASE_CONFIG to'ldirilsa — barcha qurilmalar bitta bazada ishlaydi:
   boshqa telefondan login-parol bilan kirsangiz hamma tarix chiqadi.
   Bo'sh qolsa — faqat shu qurilmaning o'zida saqlanadi (localStorage).
   ================================================================ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDIy8RjR5fmjlBbjpSI1xnvRDesQAjF1FE",
  authDomain: "unutilmastam-27858.firebaseapp.com",
  projectId: "unutilmastam-27858",
  storageBucket: "unutilmastam-27858.firebasestorage.app",
  messagingSenderId: "16064653324",
  appId: "1:16064653324:web:d14fb4ed90bc0d3ed46629"
}

/* ═══ APP CHECK ═══
   So'rov HAQIQATAN shu saytdan kelayotganini isbotlaydi. Kimdir apiKey ni
   olib boshqa saytdan yoki dastur orqali bazaga kirmoqchi bo'lsa — rad etiladi.

   Ishlatish: Firebase konsoli -> App Check -> reCAPTCHA v3 -> Register.
   Chiqqan "Site key" ni shu yerga yozing. Bo'sh qolsa App Check ishlamaydi
   (ilova baribir ishlayveradi, faqat himoyasiz bo'ladi). */
const APPCHECK_SITE_KEY = "";   // ← reCAPTCHA v3 site key shu yerga

let fsDb = null;

let fsHashes = {}

            // oxirgi ma'lum bulut holati (echo'ni oldini oladi)
let fsApplying = false;

/* Har bir kalitning lokal o'zgargan vaqti — eski bulut yangi lokalni BOSA OLMAYDI */
let keyTimes = {}

/* Bulutga yuborilmagan kalitlar navbati (oflayn bo'lsa ham yo'qolmaydi) */
let dirtyKeys = {}

let __quotaWarned = false;

/* Foydalanuvchi ekranga tegib turgan paytda ro'yxatni almashtirmaslik uchun kuzatuv.
   Sabab: real vaqtli bulut yangilanishi (masalan, boshqa mijoz yangi buyurtma berganda)
   ro'yxat DOM'ini almashtirib yuborsa, aynan shu payt bosilgan tugma "yo'qolib qoladi" —
   bu "ba'zida ochiladi, ba'zida ochilmaydi" muammosining asosiy sababi edi. */
let __lastTouchTs = 0;

const __appStartTs = Date.now();

let __rerenderGuardTimer = null;

/* ---- Yangi bildirishnoma kelganda: tovush + tebranish + tizim bildirishnomasi ----
   (masalan admin javob yozganda mijozning telefoni signal berishi uchun) */
let __seenNotifIds = null;

/* Oddiy, ishonchli "ding" ovozi — tashqi fayl kerak emas, Web Audio orqali yasaladi */
let __audioCtx = null;

/* ---------- Bulutga fon rejimida yuborish (UI hech qachon kutmaydi) ---------- */
let flushTimer = null, flushing = false;

let inRestoreMode = false;

/* ==================== AUTH: real login/register with password ==================== */
let authMode = 'login';

let regType = 'customer';

 // 'customer' | 'store'
let pendingAuthPhoto = null;

/* ============================================================
   PAROLNI TIKLASH — 3 bosqich:
   1) raqam kiritish → 2) Telegram botdan kod olib tasdiqlash → 3) yangi parol
   Endi faqat raqam yozib parolni o'zgartirib bo'lmaydi: kod majburiy.
   ============================================================ */
let pendingReset = null;

let pendingAfterAuth = null;

 // optional callback to run right after a successful login/register
let pendingRegistration = null;

 // ro'yxatdan o'tish ma'lumotlari kod tasdiqlanguncha shu yerda kutadi

/* ==== TELEGRAM TASDIQLASH SOZLAMASI ====
   1) @BotFather da bot yarating -> username'ni pastga yozing (@ belgisisiz)
   2) tasdiqlash_bot papkasini Railway'ga deploy qiling -> URL'ni pastga yozing
   Ikkalasi to'ldirilmaguncha ilova DEMO rejimda ishlайveradi. */


/* ============================================================
   ILOVA LOGOSI (chek, kuryer rejimi va h.k. uchun)
   MUHIM: avval logo splash-ekrandan olinardi, lekin splash 2 soniyadan keyin
   DOM'dan butunlay o'chirib tashlanadi — shuning uchun chekda logo chiqmay qolgan edi.
   Endi logo bir marta o'qib olinib, shu o'zgaruvchida doimiy saqlanadi.
   ============================================================ */
let APP_LOGO_B64 = '';

const TG_VERIFY = {
  bot: 'UnutilmasTamBot',
  api: 'https://unutilmastam.uz/bot'   // bot endi shu saytda (Render kerak emas)
}

// TASDIQLASH KODI (SMS/Email OTP) FUNKSIYASI: hozircha O'CHIRILGAN.
// Keyinchalik yoqish uchun shu qiymatni `true` ga o'zgartiring — boshqa hech narsani o'zgartirish shart emas.
const OTP_VERIFICATION_ENABLED = true;

let tempUserMarker = null;

/* ==================== iPHONE'GA O'RNATISH ==================== */


/* ==================== APP SHELL / NAV ==================== */
const NAVS = {
  guest: [
    {id:'catalog', icon:'bowl', tx:'Mahsulot'},
    {id:'savat', icon:'cart', tx:'Savat'},
    {id:'cabinet', icon:'user', tx:'Kabinet'},
  ],
  user: [
    {id:'catalog', icon:'bowl', tx:'Mahsulot'},
    {id:'savat', icon:'cart', tx:'Savat'},
    {id:'cabinet', icon:'user', tx:'Kabinet'},
  ],
  admin: [
    {id:'dash', icon:'home', tx:'Bosh sahifa'},
    {id:'products', icon:'box', tx:'Mahsulot'},
    {id:'scan', icon:'qr', tx:'QR skan'},
    {id:'qarz', icon:'card', tx:'Qarz daftari'},
    {id:'chat', icon:'chat', tx:'Chat'},
    {id:'analytics', icon:'chart', tx:'Analitika'},
    {id:'stores', icon:'store', tx:"Do'konlar"},
    {id:'orders', icon:'receipt', tx:'Buyurtma'},
  ],
}

let appLang = (function(){ try{ return localStorage.getItem('utam_lang') || 'uz'; }catch(e){ return 'uz'; } })();

/* ---- Qorong'i rejim ---- */
let darkMode = (function(){ try{ return localStorage.getItem('utam_dark')==='1'; }catch(e){ return false; } })();

/* ═══ TANISHISH REJIMI ═══
   Tasdiqlanmagan magazin egasi mahsulotlar bilan tanishishi mumkin,
   lekin narxlar, savat va buyurtma berish YOPIQ. */
let previewMode = false;

/* ---- Tarjima lug'ati (UZ asosiy til, RU tanlansa butun ilova shu lug'atdan
   avtomatik tarjima qilinadi — DOM matnini kuzatib boradigan tizim orqali,
   shunda yangi ochilgan har qanday oyna/bo'lim ham qo'lda ishlov berilmasdan
   o'zi tarjima bo'lib chiqadi). ---- */
const TR_RU = {
  // Navigatsiya
  'Bosh sahifa':"Главная", 'Mahsulot':"Товар", "Ma'lumot":"Инфо", 'Savat':"Корзина", 'Kabinet':"Кабинет",
  'QR skan':"QR скан", 'Qarz daftari':"Долговая книга", 'Chat':"Чат", 'Analitika':"Аналитика",
  "Do'konlar":"Магазины", 'Buyurtma':"Заказ", 'Buyurtmalar':"Заказы",
  // Yuqori panel
  "Xush kelibsiz!":"Добро пожаловать!", 'Kirish':"Войти", 'Chiqish':"Выйти",
  'Siz · Admin':"Вы · Админ", 'Mening hisobim':"Мой аккаунт", 'Menyu':"Меню",
  // Umumiy tugmalar
  'Saqlash':"Сохранить", 'Bekor qilish':"Отмена", "Qo'shish":"Добавить", "O'chirish":"Удалить",
  'Tahrirlash':"Изменить", 'Yopish':"Закрыть", 'Ha':"Да", "Yo'q":"Нет", 'Tasdiqlash':"Подтвердить",
  'Yangi':"Новый", 'Barchasi':"Все", 'Ko\'rsatilsin':"Показать", 'Yashirilsin':"Скрыть",
  'Xaritadan tanlash':"Выбрать на карте", 'Xaritadan belgilash':"Отметить на карте",
  'Sozlamalar':"Настройки", 'Ko\'rish':"Просмотр",
  // Sarlavhalar / bo'limlar
  "Sotuvchi ma'lumotlari":"Информация о продавце", 'Shaxsiy kabinet':"Личный кабинет",
  "Buyurtmalarim":"Мои заказы", "Mahsulot turi":"Тип товара",
  "Yangi buyurtmalar":"Новые заказы", 'Yangi mahsulot':"Новый товар", "Yangi turkum":"Новая категория",
  "Yangi do'kon":"Новый магазин", "Yangi joylashuv":"Новое местоположение",
  'Qarzlar':"Долги", "Yangi suhbat boshlash":"Начать новый чат",
  "Ro'yxatdan o'tgan do'kon egasi":"Зарегистрированный владелец магазина",
  // Forma maydonlari
  "Do'kon nomi":"Название магазина", "Do'kon egasining ism familyasi":"Ф.И.О. владельца магазина",
  'Telefon raqam':"Номер телефона", 'Telefon raqam yoki email':"Номер телефона или email",
  'Telefon (ixtiyoriy)':"Телефон (необязательно)", "Ism va familiya":"Имя и фамилия",
  "Ismingiz va familyangiz":"Ваше имя и фамилия", 'Mahsulot nomi':"Название товара",
  "Mahsulot haqida qisqacha...":"Краткое описание товара...", "Kategoriya nomi":"Название категории",
  "Turkum nomi":"Название категории", "Turkum nomini kiriting":"Введите название категории",
  "Do'koningiz nomi":"Название вашего магазина", "Xabar yozing...":"Напишите сообщение...",
  "Mahsulot qidirish...":"Поиск товара...", 'Tavsif (ixtiyoriy)':"Описание (необязательно)",
  "Ko'cha, mo'ljal":"Улица, ориентир", "Shahar, ko'cha, mo'ljal":"Город, улица, ориентир",
  'Yetkazish manzili':"Адрес доставки", 'Nomini kiriting':"Введите название",
  "Joriy admin kodi":"Текущий код администратора", "Yangi admin kodi":"Новый код администратора",
  'Yangi parol':"Новый пароль", "Tugma yozuvi":"Текст кнопки",
  // Status/holat
  'Tugagan':"Закончился", 'Toza':"Чисто", "To'langan":"Оплачено", "To'landi":"Оплачено",
  "To'lov kutilmoqda":"Ожидает оплаты", "Yetkazildi":"Доставлено", "Yetkazib berilgan":"Доставлено",
  "Shaxsiy":"Личный", "Do'kon uchun":"Для магазина",
  "Muddati o'tgan!":"Просрочено!", "Qolgan qarz":"Оставшийся долг",
  "Muddat belgilanmagan":"Срок не указан",
  // Buyurtma / to'lov
  "Tushum (so'm)":"Выручка (сум)", "Jami summa (so'm)":"Общая сумма (сум)",
  "To'lov summasi (so'm)":"Сумма оплаты (сум)", "To'langan summa (so'm)":"Оплаченная сумма (сум)",
  "Umumiy qarz (so'm)":"Общий долг (сум)", "Tovarlar summasi (avtomatik, so'm)":"Сумма товаров (авто, сум)",
  "To'lov qabul qilish":"Принять оплату", "To'lovni saqlash":"Сохранить оплату",
  "To'lovni belgilash":"Отметить оплату", "To'xtatish":"Остановить",
  "Tayyor deb belgilash":"Отметить как готово", "Sotilgan dona":"Продано штук",
  'Savatga qo\'shish':"Добавить в корзину", 'Buyurtmani bekor qilmoqchimisiz?':"Отменить заказ?",
  "Buyurtma bekor qilindi":"Заказ отменён",
  // Manzil
  'Manzil:':"Адрес:", 'Telefon:':"Телефон:", 'Egasi:':"Владелец:",
  'Uy manzilini xaritadan tanlang':"Выберите адрес дома на карте",
  "Uyni xaritadan tanlash":"Выбрать дом на карте", 'Xaritada ko\'rish':"Посмотреть на карте",
  "Hozirgi joylashuvga qaytish":"Вернуться к текущему местоположению",
  "Joylashuv aniqlanmoqda...":"Определение местоположения...",
  "Brauzeringiz joylashuvni aniqlay olmaydi.":"Ваш браузер не может определить местоположение.",
  // Xatolar / bildirishnomalar
  'Telefon raqami kiritilmagan':"Номер телефона не введён",
  "Kod eskirgan. Botdagi «♻️ Yangi kod olish» tugmasini bosing.":"Код устарел. Нажмите «♻️ Получить новый код» в боте.",
  "Urinishlar ko'payib ketdi. Botdan yangi kod oling.":"Слишком много попыток. Получите новый код в боте.",
  "Kod noto'g'ri. Qaytadan urinib ko'ring.":"Неверный код. Попробуйте снова.",
  "Kodni kiriting.":"Введите код.", "Nomini kiriting":"Введите название",
  "Ism va familyangizni kiriting.":"Введите имя и фамилию.",
  "Magazin nomini kiriting.":"Введите название магазина.",
  "Sizning hisobingiz administratsiya tomonidan bloklangan.":"Ваш аккаунт заблокирован администрацией.",
  "Hisobingiz bloklandi":"Ваш аккаунт заблокирован",
  "Parolni tiklash":"Восстановление пароля",
  "Parol muvaffaqiyatli yangilandi. Endi kirishingiz mumkin.":"Пароль успешно обновлён. Теперь можно войти.",
  "Hali tovar tanlanmagan":"Товар ещё не выбран",
  "Avval SOTISH yoki BUYURTMA tugmasini tanlang":"Сначала выберите ПРОДАЖА или ЗАКАЗ",
  "Kamida bitta tovar tanlang":"Выберите хотя бы один товар",
  "Kamida bitta turkum qolishi kerak.":"Должна остаться хотя бы одна категория.",
  "Hali turkum yo'q":"Категорий пока нет",
  "Do'kon qo'shilmagan":"Магазин не добавлен",
  "Ro'yxatdan o'tgan foydalanuvchi yo'q":"Зарегистрированных пользователей нет",
  "Suhbat mavjud":"Есть переписка",
  "Noma'lum manbalardan o'rnatish":"Установка из неизвестных источников",
  "Turkumni o'chirish":"Удалить категорию", "Yozuvni o'chirish":"Удалить запись",
  "Yozuvni tahrirlash":"Изменить запись", "Yozuv tafsilotlari":"Детали записи",
  "Mahsulotni tahrirlash":"Изменить товар",
  "Yaratish va QR kod chiqarish":"Создать и вывести QR-код",
  "Ishlab chiqaruvchiga yozish":"Написать производителю",
  "iPhone'ga o'rnatish":"Установить на iPhone", "Android'ga yuklab olish":"Скачать для Android",
  "Har kuni yangi, uydek issiq taomlar":"Каждый день свежие, домашние горячие блюда",
  // Qo'shimcha (real render'lardan topilgan)
  "Mahsulotlar":"Товары", "Turkum":"Категория", "Turkumlar":"Категории",
  "Do'kon":"Магазин", "Mijozlar":"Клиенты", "Foydalanuvchilar":"Пользователи",
  "Buyurtma tarixi":"История заказов", "Qarz tarixi":"История долга",
  "Bugungi savdo":"Продажи сегодня", "Umumiy savdo":"Общие продажи",
  "Ombordagi dona":"Штук на складе", "Yangi mijoz":"Новый клиент",
  "Chiqarish":"Вывод", "Kirim":"Приход", "Chiqim":"Расход",
  "Miqdori":"Количество", "Narxi":"Цена", "Sanasi":"Дата", "Holati":"Статус",
  "Mijoz":"Клиент", "Manzil":"Адрес", "Izoh":"Комментарий",
  "Savatga o'tish":"Перейти в корзину",
}

/* RU->UZ teskari lug'at — orqaga qaytarishda ishlatiladi */
const TR_UZ = {}

let __translateObserverStarted = false;

/* ==================== PRODUCTS (admin: create/edit/delete) ==================== */
let pendingImage = null;

let editingProductId = null;

const UNIT_LABELS = {gram:'g', kg:'kg', litr:'l', dona:'dona'}

const UNIT_FIELD_LABELS = {gram:"Og'irligi (gram)", kg:"Og'irligi (kilogramm)", litr:'Hajmi (litr)', dona:'Soni (necha dona)'}

/* ==================== QR SCANNER (simplified: Kirim +stock / Sotish -stock + sale log) ==================== */
let scanMode = 'in';

let scanStream = null;

let scanLoopId = null;

let scanLoopTimer = null;

let scanCanvas = null, scanCtx = null;

let nativeDetector = null;

let scanTrack = null;

let sessionQty = 0, sessionRevenue = 0;

let sessionItems = {}

let lastScanTime = 0, lastScanText = '';

/* ==================== ANALYTICS ==================== */
let analyticsPeriod = 'day';

/* ---- Mijozlar hududi bo'yicha xarita (oddiy zichlik ko'rsatkichi) ---- */
let heatmapInstance = null;

/* ==================== STORES / MAP (admin: create/edit/delete) ==================== */
let leafletMap = null;

let mapMarkers = [];

let fullLeafletMap = null;

let fullMapMarkers = [];

let orderMapMarkers = [];

let fullOrderMapMarkers = [];

let editingStoreId = null;

let __pinGradSeq = 0;

/* ---- Xaritani navigatorlardagidek "hozirgi joylashuvga qaytarish" tugmasi ---- */
let myLocMarkerMini=null, myLocMarkerFull=null;

// YANDEX_API_KEY bo'sh bo'lsa OpenStreetMap ishlatiladi (hech qanday sozlashsiz ishlaydi).
// Haqiqiy Yandex xaritasini ko'rish uchun https://developer.tech.yandex.ru/ dan bepul kalit oling
// va shu yerga qo'ying — xarita avtomatik Yandex uslubiga o'tadi.
const YANDEX_API_KEY = '';

/* ═════════ XARITA KO'RINISHI: SXEMA / SPUTNIK / GIBRID ═════════ */
const MAP_TYPE_LABELS = {'yandex#map':'Sxema','yandex#satellite':'Sputnik','yandex#hybrid':'Gibrid'}

/* Xarita birinchi ochilganda avtomatik ravishda foydalanuvchining haqiqiy
   joylashuviga keladi (ruxsat berilsa). Ruxsat bo'lmasa yoki xato bo'lsa,
   Toshkent markazida qolaveradi — hech qanday muammo tug'dirmaydi. */
let __didAutoLocate = false;

/* ==================== UNIFIED STORE WINDOW: Navigator + SOTISH/BUYURTMA tabs + multi-tovar tanlash + auto hisob ==================== */
let sdStoreId = null;

      // mavjud do'kon id, yangi pin bo'lsa null
let sdLatLng = null;

       // yangi pin uchun {lat,lng}
let sdTab = null;

          // 'sotish' | 'buyurtma'
let sdDraft = {}

          // {productId: qty}
let sdSelectedOwnerUserId = null;

let sdPickerOpen = false;

/* ---- Premium item chips & money pills ---- */
const CHIP_TINTS=[
  ['#FBE9DD','#B8430F'],
  ['#E7F6EE','#1E7A4B'],
  ['#E8F1FE','#0A5FCC'],
  ['#F3EDFE','#6D3FC8'],
  ['#FCF3DE','#9C640F'],
  ['#E6F7F6','#0E7C74'],
  ['#FDEBEC','#C22B2B']
];

let debtsAdminFilter = 'all';

const QARZ_COLORS = ['#EA5A1F','#0A7AFF','#2FA968','#F7A928','#6D3FC8','#EF4B62','#0E7C74','#B8430F'];

/* ---- Admin: qarzdorga (buyurtmachiga) qarzi haqida xabar yuborish ---- */
let debtMsgLedgerId = null;

let payTarget = null;

let editingLedgerId = null;

let openOrderRowId = null;

let liveTrackMap = null, liveTrackCourierMarker = null, liveTrackDestMarker = null, liveTrackLine = null, liveTrackOrderId = null, liveTrackInterval = null;

let pendingCourierOrderId = null;

let pendingCourierPhoto = null;

let courierWatchId = null, courierOrderId = null, courierSharingOn = false, courierLastWriteTs = 0;

/* ============================================================
   ONBOARDING — birinchi marta ochilganda qisqa tanishtiruv
   ============================================================ */
const ONBOARDING_SLIDES = [
  {icon:'logo', title:"Xush kelibsiz! 👋", text:"«Unutilmas Ta'm» — har kuni yangi, uydek issiq taomlar. Keling, ilova bilan qisqacha tanishib olamiz."},
  {icon:'bowl', title:"Katalogdan tanlang", text:"Barcha mahsulotlarni ko'ring, qidiring va sevimlilarga (❤️) qo'shib qo'ying."},
  {icon:'cart', title:"Savatga qo'shing", text:"Miqdorni belgilang, promo-kod kiriting yoki to'plagan ballaringiz bilan chegirma oling."},
  {icon:'receipt', title:"Buyurtmangizni kuzating", text:"Kabinetda buyurtma holatini, yetkazish vaqtini va hatto kuryerni jonli xaritada kuzatib boring."},
];

let onboardingIndex = 0;

let ordersAdminFilter = 'active';

let payingOrderId = null;

/* ==================== PUBLIC CATALOG / PRODUCT DETAIL / BASKET ==================== */
let basket = {}

let pdCurrentProduct = null;

let pdQty = 1;

let catalogActiveCategory = 'all';

/* ---- Sevimlilar (wishlist) — qurilma xotirasida saqlanadi ---- */
let favorites = (function(){
  try{ return JSON.parse(localStorage.getItem('utam_favorites')||'[]'); }catch(e){ return []; }
})();

/* ==================== CUSTOMER: EDIT / CANCEL OWN ORDER (only while status === 'yangi') ==================== */
let editingOrderId = null;

let editingOrderItems = [];

/* ==================== CHAT: mijoz ↔ ishlab chiqaruvchi (admin) yozishmasi ==================== */
let activeChatUserId = null;

/* ============================================================
   KALKULYATOR — mijoz oldida tezkor hisob-kitob (buyurtmaga
   ta'sir qilmaydi, faqat tezkor summa ko'rsatadi)
   ============================================================ */
let calcQty = {}

/* Kalkulyator qaysi narxni ko'rsatyapti: 'customer' yoki 'store' */
let calcMode = 'store';

/* ═════════ KALKULYATOR CHEKI ═════════
   Kalkulyatorda tanlangan mahsulotlarni chek ko'rinishida chiqaradi.
   Buyurtma cheki bilan bir xil dizaynda, lekin mijoz/kuryer/QR qismisiz. */
let calcReceiptNo = null;

/* ============================================================
   MAHSULOT YANGILIGI HAQIDA XABAR — mahsulot(lar) tanlab,
   barchaga yuborish; bosilganda o'sha mahsulotga o'tadi
   ============================================================ */
let puSelected = new Set();

/* ---- "Yozmoqda..." ko'rsatkichi (Firestore orqali, ikkala tomon ham ko'radi) ---- */
let typingTimeout = null;

let editingMsgIndex = null;

/* ---- Chatda ovozli xabar yuborish ---- */
let voiceRecorder = null, voiceChunks = [], voiceTimerInt = null, voiceStartTs = 0, voiceStream = null;

let voiceCancelled = false;

/* ============================================================
   OVOZLI QO'NG'IROQ (WebRTC + Firestore signalizatsiya)
   ------------------------------------------------------------
   Eslatma: bepul Google STUN serverlari ishlatiladi. Bu ko'pgina
   uy/ofis internetlarida yaxshi ishlaydi, lekin ba'zi mobil
   operatorlar yoki korporativ tarmoqlarda (qattiq NAT) ulanish
   qiyinlashishi mumkin — bunday holatda pullik TURN server kerak
   bo'ladi. Hozircha eng keng tarqalgan holatlar uchun yetarli.
   ============================================================ */
const ICE_SERVERS = {iceServers:[
  {urls:'stun:stun.l.google.com:19302'},
  {urls:'stun:stun1.l.google.com:19302'}
]}

let callPC = null, callLocalStream = null, callId = null, callUnsub = null, callIncomingUnsub = null;

let callRole = null;

 // 'caller' | 'callee'
let callTimerInt = null, callConnectedAt = 0, callRingtoneInt = null;

let callTargetId = null, callTargetName = '';

let __callPermWarned = false;

/* Ilova ochilganda / kirish qilinganda — kiruvchi qo'ng'iroqlarni tinglashni boshlaydi */
let __callListenerForUser = null;

let callMuted = false;

let callSpeakerOn = false;

let currentOrderType = 'shaxsiy';

let orderLat=null, orderLng=null;

let homeLocMap=null, homeLocMarker=null;

let locPickerMode = 'home';

 // 'home' — shaxsiy (uy) manzili, 'dokon' — do'kon manzili
let regPickLat = null, regPickLng = null;

let scheduleMode = 'now';

let appliedPromoCode = null;

 // {id, code, discountPercent}
const POINT_VALUE = 100;
