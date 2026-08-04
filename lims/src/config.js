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
  maxUploadBytes: Number(process.env.MAX_UPLOAD_MB || 50) * 1024 * 1024,

  jwtSecret: resolveJwtSecret(dataDir),
  sessionHours: Number(process.env.SESSION_HOURS || 12),
  // login himoyasi
  maxFailedLogins: Number(process.env.MAX_FAILED_LOGINS || 5),
  lockMinutes: Number(process.env.LOCK_MINUTES || 15),
  // xodim "online" deb hisoblanadigan oxirgi faollik oynasi
  onlineWindowMinutes: Number(process.env.ONLINE_WINDOW_MINUTES || 10),

  // HTTPS: ikkala fayl ko'rsatilsa server o'zi shifrlangan ulanishda ishlaydi.
  // Telefonga ilova o'rnatish (PWA) va oflayn rejim faqat HTTPS'da ishlaydi.
  ssl: {
    certFile: process.env.SSL_CERT_FILE || '',
    keyFile: process.env.SSL_KEY_FILE || '',
    // HTTP portida turib, HTTPS'ga yo'naltirish (0 = o'chirilgan)
    redirectFromPort: Number(process.env.SSL_REDIRECT_FROM_PORT || 0),
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
