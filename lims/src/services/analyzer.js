import { many } from '../db.js';

/**
 * Natijalarni avtomatik baholash.
 *
 * Bu qoidalarga asoslangan tahlil (rule-based): referens oraliqlar bilan
 * solishtiradi, xavfli (kritik) qiymatlarni ajratadi va xulosa matnini
 * tayyorlaydi. Tashqi AI xizmati talab qilinmaydi — lokal serverda,
 * internetsiz ham ishlaydi va tibbiy ma'lumot binodan chiqmaydi.
 *
 * Xulosa shifokor qarorining o'rnini bosmaydi — u faqat e'tiborni tortadi.
 */

export function ageYears(birthDate, at = new Date()) {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age--;
  return age;
}

/** Bemor jinsi/yoshiga mos oraliqni tanlaydi. */
export function pickRange(ranges, gender, age) {
  const a = age ?? 30;
  const fit = ranges.filter((r) => a >= r.age_min && a <= r.age_max);
  return (
    fit.find((r) => r.gender === gender) ||
    fit.find((r) => r.gender === 'u') ||
    fit[0] ||
    ranges.find((r) => r.gender === gender) ||
    ranges[0] ||
    null
  );
}

/** Bitta qiymat uchun bayroq: normal | low | high | critical_low | critical_high */
export function evaluate(value, range) {
  if (value === null || value === undefined || !range) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  if (range.critical_low !== null && range.critical_low !== undefined && v <= Number(range.critical_low))
    return 'critical_low';
  if (range.critical_high !== null && range.critical_high !== undefined && v >= Number(range.critical_high))
    return 'critical_high';
  if (range.low !== null && range.low !== undefined && v < Number(range.low)) return 'low';
  if (range.high !== null && range.high !== undefined && v > Number(range.high)) return 'high';
  return 'normal';
}

export const FLAG_LABEL = {
  normal: 'Norma',
  low: 'Past',
  high: 'Yuqori',
  critical_low: 'Kritik past',
  critical_high: 'Kritik yuqori',
  abnormal: 'Normadan chetda',
};

/** Buyurtma bo'yicha xulosa: e'tibor talab qiladigan ko'rsatkichlar ro'yxati. */
export async function summarizeOrder(orderId) {
  const rows = await many(
    `SELECT t.name, t.code, coalesce(r.unit, t.unit) AS unit,
            r.value_num, r.value_text, r.flag
       FROM order_items oi
       JOIN test_catalog t ON t.id = oi.test_id
       LEFT JOIN results r ON r.order_item_id = oi.id
      WHERE oi.order_id = $1
      ORDER BY t.sort_order, t.name`,
    [orderId],
  );

  const critical = rows.filter((r) => r.flag === 'critical_low' || r.flag === 'critical_high');
  const abnormal = rows.filter((r) => ['low', 'high', 'abnormal'].includes(r.flag));

  const notes = [];
  for (const r of [...critical, ...abnormal]) {
    const val = r.value_text ?? r.value_num;
    notes.push(`${r.name}: ${val}${r.unit ? ' ' + r.unit : ''} — ${FLAG_LABEL[r.flag]}`);
  }

  let conclusion;
  if (critical.length) {
    conclusion =
      `Diqqat: ${critical.length} ta ko‘rsatkich kritik chegarada. ` +
      `Shifokorni zudlik bilan xabardor qilish va qayta tekshiruv tavsiya qilinadi.`;
  } else if (abnormal.length) {
    conclusion =
      `${abnormal.length} ta ko‘rsatkich normadan chetda. Shifokor ko‘rigi va ` +
      `kerak bo‘lsa qayta tahlil tavsiya qilinadi.`;
  } else if (rows.some((r) => r.flag)) {
    conclusion = 'Barcha ko‘rsatkichlar norma doirasida.';
  } else {
    conclusion = 'Natijalar hali to‘liq kiritilmagan.';
  }

  return { conclusion, critical: critical.length, abnormal: abnormal.length, notes };
}
