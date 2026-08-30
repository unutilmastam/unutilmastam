/** Async route'lardagi xatolarni express'ning error handleriga uzatadi. */
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new HttpError(400, msg);
export const notFound = (msg = 'Topilmadi') => new HttpError(404, msg);
export const forbidden = (msg = 'Ruxsat yo‘q') => new HttpError(403, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Majburiy maydonlarni tekshiradi. */
export function required(body, fields) {
  const missing = fields.filter((f) => body?.[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw badRequest(`Majburiy maydonlar to‘ldirilmagan: ${missing.join(', ')}`);
}

/** Sahifalash parametrlari. */
export function paging(q, { defLimit = 50, maxLimit = 500 } = {}) {
  const limit = Math.min(Math.max(Number(q.limit) || defLimit, 1), maxLimit);
  const offset = Math.max(Number(q.offset) || 0, 0);
  return { limit, offset };
}

export function toInt(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}
