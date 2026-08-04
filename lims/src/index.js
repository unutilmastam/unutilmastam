import express from 'express';
import http from 'node:http';
import https from 'node:https';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import fs from 'node:fs';
import { config } from './config.js';
import { pool, query } from './db.js';
import { startNotifyWorker } from './services/notify.js';
import { startDeviceListeners, stopDeviceListeners } from './services/devices.js';
import { purgeOldEvents } from './services/presence.js';
import { startAppointmentWorker, stopAppointmentWorker } from './services/appointments.js';

import { router as authRouter } from './routes/auth.js';
import { router as usersRouter } from './routes/users.js';
import { router as patientsRouter } from './routes/patients.js';
import { router as visitsRouter } from './routes/visits.js';
import { router as catalogRouter } from './routes/catalog.js';
import { router as ordersRouter } from './routes/orders.js';
import { router as filesRouter } from './routes/files.js';
import { router as paymentsRouter } from './routes/payments.js';
import { router as monitoringRouter } from './routes/monitoring.js';
import { router as dashboardRouter } from './routes/dashboard.js';
import { router as inventoryRouter } from './routes/inventory.js';
import { router as labelsRouter } from './routes/labels.js';
import { router as devicesRouter } from './routes/devices.js';
import { router as camerasRouter } from './routes/cameras.js';
import { router as appointmentsRouter } from './routes/appointments.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', true);
  app.disable('x-powered-by');
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  app.get('/api/health', async (_req, res) => {
    try {
      await query('SELECT 1');
      res.json({ ok: true, db: 'up', time: new Date().toISOString(), lab: config.labName });
    } catch (err) {
      res.status(503).json({ ok: false, db: 'down', error: err.message });
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/patients', patientsRouter);
  app.use('/api/visits', visitsRouter);
  app.use('/api/catalog', catalogRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/payments', paymentsRouter);
  app.use('/api/monitoring', monitoringRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/inventory', inventoryRouter);
  app.use('/api/labels', labelsRouter);
  app.use('/api/devices', devicesRouter);
  app.use('/api/cameras', camerasRouter);
  app.use('/api/appointments', appointmentsRouter);

  // Veb-mijoz (laborant kompyuterlari brauzer orqali ishlaydi)
  const publicDir = path.join(config.root, 'public');
  app.use(express.static(publicDir, { index: 'index.html', maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(publicDir, 'index.html')));

  app.use((_req, res) => res.status(404).json({ error: 'Manzil topilmadi' }));

  // Markaziy xato ishlovchisi
  app.use((err, req, res, _next) => {
    const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
    if (status >= 500) console.error('[xato]', req.method, req.originalUrl, err);
    res.status(status).json({
      error: status >= 500 ? 'Serverda ichki xatolik yuz berdi' : err.message,
    });
  });

  return app;
}

/**
 * Sertifikat ko'rsatilgan bo'lsa HTTPS, aks holda HTTP server.
 * Nginx/Apache o'rnatish shart emas — Windows serverlar uchun muhim.
 */
function createServer(app) {
  const { certFile, keyFile, redirectFromPort } = config.ssl;
  if (!certFile || !keyFile) return http.createServer(app);

  const options = {
    cert: fs.readFileSync(certFile),
    key: fs.readFileSync(keyFile),
  };

  if (redirectFromPort) {
    http.createServer((req, res) => {
      const host = String(req.headers.host || '').split(':')[0];
      res.writeHead(301, { location: `https://${host}:${config.port}${req.url}` });
      res.end();
    }).listen(redirectFromPort, config.host, () => {
      console.log(`HTTP → HTTPS yo‘naltirish: ${redirectFromPort} → ${config.port}`);
    });
  }
  return https.createServer(options, app);
}

export async function start() {
  fs.mkdirSync(config.filesDir, { recursive: true });

  // Baza tayyorligini tekshiramiz — jadval yo'q bo'lsa aniq xabar beramiz.
  try {
    await query('SELECT 1 FROM users LIMIT 1');
  } catch (err) {
    console.error(
      '\n[!] Bazaga ulanib bo‘lmadi yoki sxema o‘rnatilmagan.\n' +
        '    DATABASE_URL: ' + config.db.connectionString + '\n' +
        '    Yechim: npm run migrate && npm run seed\n' +
        '    Xato: ' + err.message + '\n',
    );
    process.exitCode = 1;
    return null;
  }

  const app = createApp();
  const server = createServer(app);

  server.listen(config.port, config.host, () => {
    const scheme = server instanceof https.Server ? 'https' : 'http';
    console.log(`LabCore LIMS — ${scheme}://${config.host}:${config.port}  (${config.env})`);
    console.log(`Ma'lumotlar: ${config.dataDir}`);
    if (scheme === 'http') {
      console.log(
        'Eslatma: telefonga ilova o‘rnatish (PWA) va oflayn rejim uchun HTTPS kerak.\n' +
        '         SSL_CERT_FILE va SSL_KEY_FILE ni sozlang.',
      );
    }
  });
  startNotifyWorker();
  startAppointmentWorker();   // navbat eslatmalari va kelmaganlarni belgilash

  // Analizatorlardan natija qabul qilish (HL7/ASTM porti yoki papka kuzatuvi)
  const deviceCount = await startDeviceListeners();
  if (deviceCount) console.log(`Uskunalar: ${deviceCount} ta ulanish faol`);

  // Kamera hodisalarini saqlash muddati — maxfiylik talabi (kuniga bir marta)
  const purgeTimer = setInterval(() => {
    purgeOldEvents()
      .then((n) => n && console.log(`[kamera] ${n} ta eski hodisa o‘chirildi`))
      .catch((e) => console.error('[kamera] tozalash xatosi:', e.message));
  }, 24 * 3600 * 1000);
  purgeTimer.unref();

  const shutdown = async (signal) => {
    console.log(`\n${signal} — server to‘xtatilmoqda...`);
    server.close(async () => {
      stopAppointmentWorker();
      await stopDeviceListeners().catch(() => {});
      await pool.end().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (import.meta.url === `file://${process.argv[1]}`) start();
