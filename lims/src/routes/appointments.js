import express from 'express';
import { many, one, query } from '../db.js';
import { audit, diff } from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { badRequest, notFound, required, wrap } from '../lib/http.js';
import {
  REMINDER_MINUTES, SLOT_CAPACITY, SLOT_MINUTES, WORK_END, WORK_START,
  book, localDate, localTime, markArrived, queueForDate, slotsForDate, upcoming,
} from '../services/appointments.js';

export const router = express.Router();
router.use(requireAuth);

// Navbatga yozish huquqi: registratura (laborant), kassir va administrator
const CAN_BOOK = ['admin', 'laborant', 'cashier'];

/** Sozlamalar — klient shakl uchun. */
router.get(
  '/config',
  wrap(async (_req, res) => {
    res.json({
      today: localDate(),          // laboratoriya vaqt mintaqasidagi bugun
      timezone: process.env.TZ_NAME || 'Asia/Tashkent',
      slot_minutes: SLOT_MINUTES,
      capacity: SLOT_CAPACITY,
      work_start: WORK_START,
      work_end: WORK_END,
      reminder_minutes: REMINDER_MINUTES,
      regions: REGIONS,
    });
  }),
);

/** Kun bo'yicha bo'sh vaqtlar. */
router.get(
  '/slots',
  wrap(async (req, res) => {
    const date = req.query.date || localDate();
    res.json({ date, slots: await slotsForDate(date, req.query.branch_id ? Number(req.query.branch_id) : null) });
  }),
);

/** Kunlik navbat ro'yxati. */
router.get(
  '/',
  wrap(async (req, res) => {
    const date = req.query.date || localDate();
    const items = await queueForDate(date, req.query.branch_id ? Number(req.query.branch_id) : null);
    res.json({
      date,
      items: items.map((a) => ({ ...a, time: localTime(a.scheduled_at) })),
      counts: {
        total: items.length,
        waiting: items.filter((a) => ['booked', 'confirmed'].includes(a.status)).length,
        arrived: items.filter((a) => a.status === 'arrived').length,
        done: items.filter((a) => a.status === 'done').length,
        no_show: items.filter((a) => a.status === 'no_show').length,
      },
    });
  }),
);

/** Vaqti yaqinlashgan navbatlar — xodim ekranidagi ogohlantirish uchun. */
router.get(
  '/upcoming',
  wrap(async (req, res) => {
    const items = await upcoming(req.query.minutes ? Number(req.query.minutes) : undefined);
    res.json({ items: items.map((a) => ({ ...a, time: localTime(a.scheduled_at) })) });
  }),
);

/** Telefon raqami bo'yicha oldingi bemorni topish (qayta yozilganda). */
router.get(
  '/lookup',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    if (q.length < 3) return res.json({ patients: [], previous: [] });

    const patients = await many(
      `SELECT id, card_number, last_name, first_name, middle_name, birth_date, gender, phone, address
         FROM patients WHERE search_text LIKE $1 LIMIT 5`,
      [`%${q.toLowerCase()}%`],
    );
    const previous = await many(
      `SELECT DISTINCT ON (phone, lower(last_name), lower(first_name))
              last_name, first_name, middle_name, phone, region, district, gender,
              birth_date, age_years, patient_id
         FROM appointments
        WHERE phone ILIKE $1 OR lower(last_name || ' ' || first_name) LIKE $2
        ORDER BY phone, lower(last_name), lower(first_name), created_at DESC
        LIMIT 5`,
      [`%${q}%`, `%${q.toLowerCase()}%`],
    );
    res.json({ patients, previous });
  }),
);

/** Navbatga yozish. */
router.post(
  '/',
  requireRole(...CAN_BOOK),
  wrap(async (req, res) => {
    required(req.body, ['last_name', 'first_name', 'phone', 'scheduled_at']);
    const b = req.body;

    if (Number.isNaN(Date.parse(b.scheduled_at))) throw badRequest('Vaqt noto‘g‘ri');
    if (new Date(b.scheduled_at) < new Date(Date.now() - 60_000))
      throw badRequest('O‘tgan vaqtga navbat berib bo‘lmaydi');
    if (b.age_years && (b.age_years < 0 || b.age_years > 130)) throw badRequest('Yosh noto‘g‘ri');

    const a = await book(b, req.user);

    await audit(req, {
      action: 'CREATE',
      entity: 'appointment',
      entityId: a.id,
      patientId: a.patient_id,
      description:
        `Navbatga yozildi №${a.queue_number}: ${a.last_name} ${a.first_name}, ` +
        `${localDate(a.scheduled_at)} ${localTime(a.scheduled_at)}, tel ${a.phone}` +
        (a.region ? ` (${[a.region, a.district].filter(Boolean).join(', ')})` : ''),
      newData: {
        queue_number: a.queue_number, scheduled_at: a.scheduled_at,
        phone: a.phone, region: a.region, district: a.district,
      },
    });

    res.status(201).json({ ...a, time: localTime(a.scheduled_at) });
  }),
);

/** Tahrirlash (vaqtini ko'chirish, telefonni tuzatish). */
router.patch(
  '/:id',
  requireRole(...CAN_BOOK),
  wrap(async (req, res) => {
    const before = await one('SELECT * FROM appointments WHERE id = $1', [req.params.id]);
    if (!before) throw notFound('Navbat topilmadi');
    if (['done', 'cancelled'].includes(before.status)) throw badRequest('Yopilgan navbatni o‘zgartirib bo‘lmaydi');

    const fields = ['last_name', 'first_name', 'middle_name', 'birth_date', 'age_years',
      'gender', 'phone', 'region', 'district', 'address', 'note', 'status'];
    const patch = {};
    for (const f of fields) if (req.body[f] !== undefined) patch[f] = req.body[f];

    // Vaqt ko'chirilsa eslatma qaytadan yuborilishi kerak
    if (req.body.scheduled_at && req.body.scheduled_at !== before.scheduled_at) {
      patch.scheduled_at = req.body.scheduled_at;
      patch.scheduled_date = localDate(req.body.scheduled_at);
      patch.reminder_sent_at = null;
    }
    if (!Object.keys(patch).length) return res.json(before);

    const sets = Object.keys(patch).map((k, i) => `${k} = $${i + 2}`);
    const after = await one(
      `UPDATE appointments SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
      [before.id, ...Object.values(patch)],
    );

    const d = diff(before, after, Object.keys(patch));
    if (d) {
      await audit(req, {
        action: 'UPDATE', entity: 'appointment', entityId: before.id, patientId: after.patient_id,
        description: `Navbat o‘zgartirildi №${before.queue_number}: ${after.last_name} ${after.first_name}`,
        ...d,
      });
    }
    res.json({ ...after, time: localTime(after.scheduled_at) });
  }),
);

/** Bemor keldi — kartani ochadi/topadi. */
router.post(
  '/:id/arrive',
  requireRole(...CAN_BOOK, 'doctor'),
  wrap(async (req, res) => {
    const result = await markArrived(req.params.id, req.user);
    if (!result) throw notFound('Navbat topilmadi');

    await audit(req, {
      action: 'UPDATE',
      entity: 'appointment',
      entityId: result.appointment.id,
      patientId: result.patient_id,
      description:
        `Navbat bo‘yicha keldi №${result.appointment.queue_number}: ` +
        `${result.appointment.last_name} ${result.appointment.first_name}` +
        (result.created_card ? ' (yangi karta ochildi)' : ''),
      newData: { status: 'arrived', patient_id: result.patient_id },
    });
    res.json(result);
  }),
);

/** Bekor qilish. */
router.post(
  '/:id/cancel',
  requireRole(...CAN_BOOK),
  wrap(async (req, res) => {
    const a = await one(
      `UPDATE appointments SET status = 'cancelled', cancelled_by = $2, cancel_reason = $3
        WHERE id = $1 AND status NOT IN ('done') RETURNING *`,
      [req.params.id, req.user.id, req.body?.reason || null],
    );
    if (!a) throw notFound('Navbat topilmadi yoki allaqachon yopilgan');

    await audit(req, {
      action: 'UPDATE', entity: 'appointment', entityId: a.id, patientId: a.patient_id,
      description: `Navbat bekor qilindi №${a.queue_number}: ${req.body?.reason || 'sabab ko‘rsatilmagan'}`,
      oldData: { status: 'booked' }, newData: { status: 'cancelled' },
    });
    res.json(a);
  }),
);

/** Xizmat ko'rsatildi (buyurtma berilgandan keyin). */
router.post(
  '/:id/done',
  requireRole(...CAN_BOOK, 'doctor'),
  wrap(async (req, res) => {
    const a = await one(
      `UPDATE appointments SET status = 'done', order_id = coalesce($2, order_id)
        WHERE id = $1 RETURNING *`,
      [req.params.id, req.body?.order_id || null],
    );
    if (!a) throw notFound('Navbat topilmadi');
    await audit(req, {
      action: 'UPDATE', entity: 'appointment', entityId: a.id, patientId: a.patient_id,
      description: `Navbat yakunlandi №${a.queue_number}`,
      newData: { status: 'done', order_id: a.order_id },
    });
    res.json(a);
  }),
);

/** Hudud statistikasi — bemorlar qaysi tumanlardan kelmoqda. */
router.get(
  '/stats',
  requireRole('admin'),
  wrap(async (req, res) => {
    const from = req.query.from || new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
    const to = req.query.to || localDate();

    const [byRegion, byDay, summary] = await Promise.all([
      many(
        `SELECT coalesce(region, 'Ko‘rsatilmagan') AS region, count(*)::int AS c
           FROM appointments WHERE scheduled_date BETWEEN $1 AND $2
          GROUP BY region ORDER BY c DESC`,
        [from, to],
      ),
      many(
        `SELECT scheduled_date AS day, count(*)::int AS total,
                count(*) FILTER (WHERE status = 'no_show')::int AS no_show
           FROM appointments WHERE scheduled_date BETWEEN $1 AND $2
          GROUP BY day ORDER BY day`,
        [from, to],
      ),
      one(
        `SELECT count(*)::int AS total,
                count(*) FILTER (WHERE status = 'no_show')::int AS no_show,
                count(*) FILTER (WHERE status IN ('arrived','done'))::int AS came
           FROM appointments WHERE scheduled_date BETWEEN $1 AND $2`,
        [from, to],
      ),
    ]);
    res.json({ from, to, summary, byRegion, byDay });
  }),
);

// O'zbekiston viloyatlari — hudud maydonini to'ldirish uchun
const REGIONS = [
  'Toshkent shahri', 'Toshkent viloyati', 'Andijon', 'Buxoro', 'Farg‘ona',
  'Jizzax', 'Xorazm', 'Namangan', 'Navoiy', 'Qashqadaryo', 'Qoraqalpog‘iston',
  'Samarqand', 'Sirdaryo', 'Surxondaryo',
];
