import { forbidden } from './http.js';

/**
 * "Laborant eski ma'lumotlarni o'zgartira olmaydi" qoidasi.
 *
 * Tahrirlash oynasi: laborant o'zi kiritgan yozuvni faqat belgilangan soat
 * ichida tuzatishi mumkin. Undan keyin — faqat administrator, va har bir
 * o'zgarish auditga tushadi.
 */
export const EDIT_WINDOW_HOURS = Number(process.env.EDIT_WINDOW_HOURS || 24);

export function ensureCanEdit(user, record, opts = {}) {
  const { ownerField = 'created_by', timeField = 'created_at', what = 'yozuv' } = opts;
  if (user.role === 'admin') return; // administrator har doim tuzata oladi (audit bilan)

  const createdAt = record?.[timeField] ? new Date(record[timeField]) : null;
  const ageHours = createdAt ? (Date.now() - createdAt.getTime()) / 3_600_000 : Infinity;

  if (ageHours > EDIT_WINDOW_HOURS) {
    throw forbidden(
      `Bu ${what} ${EDIT_WINDOW_HOURS} soatdan eski. O‘zgartirish uchun administratorga murojaat qiling.`,
    );
  }
  if (record?.[ownerField] && record[ownerField] !== user.id) {
    throw forbidden(`Bu ${what}ni boshqa xodim kiritgan — faqat administrator tuzata oladi.`);
  }
}

/** Tasdiqlangan natijani faqat administrator qayta ochadi. */
export function ensureCanEditResult(user, result) {
  if (user.role === 'admin') return;
  if (result?.confirmed_at) {
    throw forbidden('Natija tasdiqlangan. O‘zgartirish uchun administratorga murojaat qiling.');
  }
  ensureCanEdit(user, result, { ownerField: 'entered_by', timeField: 'entered_at', what: 'natija' });
}
