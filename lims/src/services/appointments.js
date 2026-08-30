import { config } from '../config.js';
import { many, one, query, tx } from '../db.js';
import { queue as queueNotification } from './notify.js';

/**
 * Navbat xizmati: telefonda yozib olish, bo'sh vaqtlarni ko'rsatish,
 * vaqti yaqinlashganda eslatma yuborish.
 */

export const SLOT_MINUTES = Number(process.env.APPOINTMENT_SLOT_MINUTES || 15);
export const SLOT_CAPACITY = Number(process.env.APPOINTMENT_CAPACITY || 2);
export const WORK_START = process.env.WORK_START || '08:00';
export const WORK_END = process.env.WORK_END || '18:00';
export const REMINDER_MINUTES = Number(process.env.APPOINTMENT_REMINDER_MINUTES || 60);

/** Laboratoriya vaqt mintaqasidagi sana (YYYY-MM-DD). */
export function localDate(value = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

/** Laboratoriya vaqt mintaqasidagi soat:daqiqa. */
export function localTime(value) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}

/**
 * Kun bo'yicha bo'sh vaqtlar: har bir oraliqda nechta joy band, nechta bo'sh.
 */
export async function slotsForDate(date, branchId = null) {
  const rows = await many(
    `SELECT scheduled_at, count(*)::int AS booked
       FROM appointments
      WHERE scheduled_date = $1::date
        AND status NOT IN ('cancelled','no_show')
        AND ($2::int IS NULL OR branch_id = $2)
      GROUP BY scheduled_at`,
    [date, branchId],
  );
  const taken = new Map(rows.map((r) => [localTime(r.scheduled_at), r.booked]));

  const [sh, sm] = WORK_START.split(':').map(Number);
  const [eh, em] = WORK_END.split(':').map(Number);
  const slots = [];

  // Bugungi kun uchun o'tib ketgan vaqtlar band deb ko'rsatiladi: registrator
  // ularni tanlab, keyin xato olib qolmasin.
  const today = localDate();
  const nowHM = date === today ? localTime(new Date()) : null;

  for (let m = sh * 60 + sm; m < eh * 60 + em; m += SLOT_MINUTES) {
    const time = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const booked = taken.get(time) || 0;
    const past = nowHM !== null && time <= nowHM;
    slots.push({
      time,
      booked,
      past,
      free: past ? 0 : Math.max(0, SLOT_CAPACITY - booked),
      capacity: SLOT_CAPACITY,
    });
  }
  return slots;
}

/**
 * Navbatga yozish. Navbat raqami kun bo'yicha ketma-ket beriladi.
 * Bir vaqtda ikki xodim yozsa ham raqam takrorlanmasligi uchun tranzaksiya
 * ichida jadval qulflanadi.
 */
export async function book(data, user) {
  const date = localDate(data.scheduled_at);
  // Filial bir marta aniqlanadi: sig'im tekshiruvi, navbat raqami va yozuvning
  // o'zi bir xil filialga tegishli bo'lishi shart, aks holda raqam takrorlanadi.
  const branchId = data.branch_id ?? user?.branch_id ?? null;

  return tx(async (c) => {
    await c.query('LOCK TABLE appointments IN SHARE ROW EXCLUSIVE MODE');

    const cap = await c.query(
      `SELECT count(*)::int AS c FROM appointments
        WHERE scheduled_at = $1::timestamptz AND status NOT IN ('cancelled','no_show')
          AND coalesce(branch_id, 0) = coalesce($2::int, 0)`,
      [data.scheduled_at, branchId],
    );
    if (cap.rows[0].c >= SLOT_CAPACITY) {
      const err = new Error('Bu vaqt band — boshqa vaqtni tanlang');
      err.status = 409;
      throw err;
    }

    const seq = await c.query(
      `SELECT coalesce(max(queue_number), 0) + 1 AS n FROM appointments
        WHERE scheduled_date = $1::date AND coalesce(branch_id, 0) = coalesce($2::int, 0)`,
      [date, branchId],
    );

    const res = await c.query(
      `INSERT INTO appointments
         (queue_number, scheduled_at, scheduled_date, duration_min, patient_id,
          last_name, first_name, middle_name, birth_date, age_years, gender, phone,
          region, district, address, note, test_ids, branch_id, created_by)
       VALUES ($1,$2,$3::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING *`,
      [
        seq.rows[0].n, data.scheduled_at, date, data.duration_min || SLOT_MINUTES,
        data.patient_id || null,
        data.last_name, data.first_name, data.middle_name || null,
        data.birth_date || null, data.age_years || null, data.gender || 'u', data.phone,
        data.region || null, data.district || null, data.address || null,
        data.note || null, data.test_ids?.length ? data.test_ids : null,
        branchId, user?.id ?? null,
      ],
    );
    return res.rows[0];
  });
}

/** Kunlik navbat ro'yxati. */
export function queueForDate(date, branchId = null) {
  return many(
    `SELECT a.*, u.full_name AS created_by_name,
            p.card_number,
            (SELECT count(*) FROM appointments x
              WHERE x.phone = a.phone AND x.status = 'no_show') AS past_no_shows
       FROM appointments a
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN patients p ON p.id = a.patient_id
      WHERE a.scheduled_date = $1::date
        AND ($2::int IS NULL OR a.branch_id = $2)
      ORDER BY a.scheduled_at, a.queue_number`,
    [date, branchId],
  );
}

/** Vaqti yaqinlashgan navbatlar — xodim ekranida ko'rsatish uchun. */
export function upcoming(minutes = REMINDER_MINUTES) {
  return many(
    `SELECT a.id, a.queue_number, a.scheduled_at, a.last_name, a.first_name,
            a.phone, a.status, a.patient_id, a.region, a.district,
            round(extract(epoch FROM a.scheduled_at - now()) / 60)::int AS minutes_left
       FROM appointments a
      WHERE a.status IN ('booked','confirmed')
        AND a.scheduled_at BETWEEN now() - interval '15 minutes'
                              AND now() + ($1 || ' minutes')::interval
      ORDER BY a.scheduled_at`,
    [String(minutes)],
  );
}

/**
 * Eslatmalarni yuborish (fon jarayoni).
 * Bemorga SMS/Telegram navbatga qo'yiladi, xodim ekranida esa "yaqinlashmoqda"
 * ro'yxati ko'rinadi. Har bir navbat uchun bir marta.
 */
export async function sendReminders() {
  const due = await many(
    `SELECT * FROM appointments
      WHERE status IN ('booked','confirmed')
        AND reminder_sent_at IS NULL
        AND scheduled_at BETWEEN now() AND now() + ($1 || ' minutes')::interval
      ORDER BY scheduled_at LIMIT 50`,
    [String(REMINDER_MINUTES)],
  );

  let sent = 0;
  for (const a of due) {
    const time = localTime(a.scheduled_at);
    const text =
      `${config.labName}: hurmatli ${a.last_name} ${a.first_name}, ` +
      `siz bugun soat ${time} ga navbatdasiz (navbat №${a.queue_number}). ` +
      `Iltimos, 10 daqiqa oldin yetib keling.`;

    if (a.phone) {
      await queueNotification({
        patientId: a.patient_id,
        channel: 'sms',
        recipient: a.phone,
        body: text,
        userId: a.created_by,
      });
    }

    await query('UPDATE appointments SET reminder_sent_at = now() WHERE id = $1', [a.id]);

    // Xodim ekranida ko'rinishi uchun auditga yozamiz (nazorat izi ham bo'ladi)
    await query(
      `INSERT INTO audit_log (user_id, user_name, action, entity, entity_id, patient_id, description)
       VALUES (NULL, 'Tizim', 'REMINDER', 'appointment', $1, $2, $3)`,
      [
        String(a.id), a.patient_id,
        `Navbat yaqinlashmoqda: №${a.queue_number} — ${a.last_name} ${a.first_name}, soat ${time}`,
      ],
    );
    sent++;
  }
  return sent;
}

/** Kelmagan navbatlarni belgilash (vaqti o'tib ketgan). */
export async function markNoShows(graceMinutes = 45) {
  const res = await query(
    `UPDATE appointments SET status = 'no_show'
      WHERE status IN ('booked','confirmed')
        AND scheduled_at < now() - ($1 || ' minutes')::interval
      RETURNING id`,
    [String(graceMinutes)],
  );
  return res.rowCount;
}

let timer = null;

/** Fon jarayoni: eslatmalar va kelmaganlarni belgilash. */
export function startAppointmentWorker() {
  if (timer) clearInterval(timer);
  timer = setInterval(async () => {
    try {
      const sent = await sendReminders();
      if (sent) console.log(`[navbat] ${sent} ta eslatma yuborildi`);
      await markNoShows();
    } catch (err) {
      console.error('[navbat]', err.message);
    }
  }, 60_000);
  timer.unref();
  return timer;
}

export function stopAppointmentWorker() {
  if (timer) clearInterval(timer);
  timer = null;
}

/** Bemor keldi: kartani topadi yoki yangisini ochadi va navbatga bog'laydi. */
export async function markArrived(appointmentId, user) {
  const a = await one('SELECT * FROM appointments WHERE id = $1', [appointmentId]);
  if (!a) return null;

  let patientId = a.patient_id;
  let createdCard = false;      // aynan yangi karta ochildimi (topilgani emas)
  if (!patientId) {
    // Telefon va ism bo'yicha mavjud kartani qidiramiz
    const existing = await one(
      `SELECT id FROM patients
        WHERE phone = $1 AND lower(last_name) = lower($2) AND lower(first_name) = lower($3)
        LIMIT 1`,
      [a.phone, a.last_name, a.first_name],
    );

    if (existing) {
      patientId = existing.id;
    } else {
      const card = await one(`SELECT nextval('patient_card_seq')::text AS n`);
      const birth = a.birth_date
        || (a.age_years ? `${new Date().getFullYear() - a.age_years}-01-01` : null);
      const p = await one(
        `INSERT INTO patients (card_number, last_name, first_name, middle_name, birth_date,
                               gender, phone, address, branch_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [
          card.n, a.last_name, a.first_name, a.middle_name, birth, a.gender, a.phone,
          [a.region, a.district, a.address].filter(Boolean).join(', ') || null,
          a.branch_id, user.id,
        ],
      );
      patientId = p.id;
      createdCard = true;
    }
  }

  const updated = await one(
    `UPDATE appointments SET status = 'arrived', arrived_at = now(), patient_id = $2
      WHERE id = $1 RETURNING *`,
    [appointmentId, patientId],
  );
  return { appointment: updated, patient_id: patientId, created_card: createdCard };
}
