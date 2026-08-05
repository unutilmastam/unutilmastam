import 'dotenv/config';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');

/**
 * JWT kaliti. Ishlab chiqarishda .env orqali beriladi; berilmasa
 * data/.jwt-secret faylida saqlanadi (server qayta ishga tushganda
 * sessiyalar yo'qolmasligi uchun).
 */
function resolveJwtSecret(dataDir) {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(dataDir, '.jwt-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));

export const config = {
  root,
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  host: process.env.HOST || '0.0.0.0',

  db: {
    connectionString:
      process.env.DATABASE_URL || 'postgres://localhost:5432/labcore',
    max: Number(process.env.DB_POOL_MAX || 10),
  },

  dataDir,
  filesDir: path.join(dataDir, 'Patients'),
  staffPhotoDir: path.join(dataDir, 'Staff'),
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024,
  maxPhotoBytes: Number(process.env.MAX_PHOTO_MB || 5) * 1024 * 1024,

  jwtSecret: resolveJwtSecret(dataDir),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  // login himoyasi
  maxFailedLogins: Number(process.env.MAX_FAILED_LOGINS || 5),
  lockMinutes: Number(process.env.LOCK_MINUTES || 15),
  // Bir IP'dan bir daqiqada nechta kirish urinishi. Butun laboratoriya
  // bitta routerdan chiqsa (NAT) barcha kompyuterlar bitta IP ko'rinadi —
  // shuning uchun sozlanadigan qilingan.
  loginRateMax: Number(process.env.LOGIN_RATE_MAX || 10),

  /**
   * Shaxsiy PIN kod bilan kirish (ish stansiyasi uchun tez usul).
   * Kirish oynasida PIN qo'ygan xodimlarning ismi va rasmi ko'rinadi —
   * laboratoriya ichki tarmog'ida bu qulaylik, lekin server internetga
   * ochiq bo'lsa PIN_LOGIN=0 qilib o'chirib qo'ying.
   * PIN qisqa bo'lgani uchun bloklash paroldagidan qattiqroq.
   */
  pin: {
    enabled: process.env.PIN_LOGIN !== '0',
    minLength: Math.max(4, Number(process.env.PIN_MIN_LENGTH || 4)),
    maxLength: 8,
    maxFailed: Number(process.env.PIN_MAX_FAILED || 3),
    lockMinutes: Number(process.env.PIN_LOCK_MINUTES || 10),
  },

  // xodim "online" deb hisoblanadigan oxirgi faollik oynasi
  onlineWindowMinutes: Number(process.env.ONLINE_WINDOW_MINUTES || 10),

  // HTTPS: ikkala fayl ko'rsatilsa server o'zi shifrlangan ulanishda ishlaydi.
  // Telefonga ilova o'rnatish (PWA) va oflayn rejim faqat HTTPS'da ishlaydi.
  // DIQQAT: nomlar LABCORE_ bilan boshlanadi. SSL_CERT_FILE — OpenSSL va
  // curl ishlatadigan standart o'zgaruvchi (CA to'plamini ko'rsatadi);
  // o'sha nomni olsak, tizimda u allaqachon o'rnatilgan bo'lsa server
  // noto'g'ri sertifikatni o'qib ishga tushmay qoladi.
  ssl: {
    certFile: process.env.LABCORE_SSL_CERT || '',
    keyFile: process.env.LABCORE_SSL_KEY || '',
    // HTTP portida turib, HTTPS'ga yo'naltirish (0 = o'chirilgan)
    redirectFromPort: Number(process.env.LABCORE_SSL_REDIRECT_PORT || 0),
  },

  labName: process.env.LAB_NAME || 'Laboratoriya',
  currency: process.env.CURRENCY || "so'm",
  timezone: process.env.TZ_NAME || 'Asia/Tashkent',

  notify: {
    // Adapterlar sozlanmagan bo'lsa xabarlar navbatda "queued" bo'lib qoladi.
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    smsGatewayUrl: process.env.SMS_GATEWAY_URL || '',
    smsGatewayToken: process.env.SMS_GATEWAY_TOKEN || '',
    smtpUrl: process.env.SMTP_URL || '',
    workerIntervalMs: Number(process.env.NOTIFY_INTERVAL_MS || 30_000),
  },
};
