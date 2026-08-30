import { config } from '../config.js';
import { many, one, query } from '../db.js';

/**
 * Bildirishnomalar: navbatga yoziladi, so'ng fon jarayoni yuboradi.
 * Kanal sozlanmagan bo'lsa xabar navbatda qoladi va yo'qolmaydi —
 * internet tiklangach yuboriladi (lokal server uchun muhim).
 */

export async function queue({ patientId, orderId, channel, recipient, subject, body, userId }) {
  if (!recipient) return null;
  return one(
    `INSERT INTO notifications (patient_id, order_id, channel, recipient, subject, body, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, channel, status`,
    [patientId || null, orderId || null, channel, recipient, subject || null, body, userId || null],
  );
}

/** Natija tayyor bo'lganda bemorga xabar. */
export async function queueOrderReady(order, userId) {
  const text =
    `${config.labName}: hurmatli ${order.last_name} ${order.first_name}, ` +
    `${order.order_number} raqamli tahlil natijangiz tayyor.`;
  const queued = [];
  if (order.phone) {
    if (config.notify.smsGatewayUrl) {
      queued.push(await queue({ patientId: order.patient_id, orderId: order.id, channel: 'sms', recipient: order.phone, body: text, userId }));
    }
    if (config.notify.telegramBotToken) {
      const chat = await one('SELECT telegram_chat_id FROM patient_contacts WHERE patient_id = $1', [order.patient_id]).catch(() => null);
      if (chat?.telegram_chat_id) {
        queued.push(await queue({ patientId: order.patient_id, orderId: order.id, channel: 'telegram', recipient: chat.telegram_chat_id, body: text, userId }));
      }
    }
  }
  return queued.filter(Boolean);
}

/** Kritik natija — shifokor/adminga darhol ogohlantirish. */
export async function queueCriticalAlert(order, notes, userId) {
  const admins = await many(
    `SELECT full_name, phone FROM users WHERE role IN ('admin','doctor') AND is_active AND phone IS NOT NULL`,
  );
  const body =
    `DIQQAT: ${order.order_number} (${order.last_name} ${order.first_name}) — kritik ko‘rsatkich.\n` +
    notes.join('\n');
  const out = [];
  for (const a of admins) {
    out.push(await queue({ patientId: order.patient_id, orderId: order.id, channel: 'sms', recipient: a.phone, body, userId }));
  }
  return out.filter(Boolean);
}

// ---------------------------------------------------------------------------
// Yuborish adapterlari
// ---------------------------------------------------------------------------

async function sendSms(n) {
  if (!config.notify.smsGatewayUrl) throw new Error('SMS shlyuzi sozlanmagan');
  const r = await fetch(config.notify.smsGatewayUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(config.notify.smsGatewayToken ? { authorization: `Bearer ${config.notify.smsGatewayToken}` } : {}),
    },
    body: JSON.stringify({ to: n.recipient, text: n.body }),
  });
  if (!r.ok) throw new Error(`SMS shlyuzi javobi: ${r.status}`);
}

async function sendTelegram(n) {
  if (!config.notify.telegramBotToken) throw new Error('Telegram bot tokeni sozlanmagan');
  const r = await fetch(`https://api.telegram.org/bot${config.notify.telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: n.recipient, text: n.body }),
  });
  if (!r.ok) throw new Error(`Telegram javobi: ${r.status}`);
}

async function sendEmail() {
  // SMTP integratsiyasi o'rnatilgandan keyin shu yerda amalga oshiriladi.
  throw new Error('Email kanali hali sozlanmagan');
}

const SENDERS = { sms: sendSms, telegram: sendTelegram, email: sendEmail };

/** Navbatdagi xabarlarni yuborish (fon jarayoni chaqiradi). */
export async function flushQueue(limit = 20) {
  const rows = await many(
    `SELECT * FROM notifications
      WHERE status = 'queued' AND attempts < 5
      ORDER BY created_at LIMIT $1`,
    [limit],
  );
  let sent = 0;
  for (const n of rows) {
    try {
      await SENDERS[n.channel](n);
      await query(`UPDATE notifications SET status='sent', sent_at=now(), attempts=attempts+1 WHERE id=$1`, [n.id]);
      sent++;
    } catch (err) {
      await query(
        `UPDATE notifications SET attempts = attempts + 1, last_error = $2,
                status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'queued' END
          WHERE id = $1`,
        [n.id, String(err.message).slice(0, 300)],
      );
    }
  }
  return sent;
}

export function startNotifyWorker() {
  const anyChannel =
    config.notify.smsGatewayUrl || config.notify.telegramBotToken || config.notify.smtpUrl;
  if (!anyChannel) {
    console.log('[notify] kanallar sozlanmagan — xabarlar navbatda saqlanadi');
    return null;
  }
  const timer = setInterval(() => {
    flushQueue().catch((e) => console.error('[notify]', e.message));
  }, config.notify.workerIntervalMs);
  timer.unref();
  return timer;
}
