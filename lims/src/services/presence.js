import { many, one } from '../db.js';

/**
 * Xodimning ish joyida bo'lgan vaqtini kamera hodisalaridan hisoblash.
 *
 * Kamera (yoki NVR'dagi AI) "falonchi ko'rindi" degan hodisalarni yuboradi.
 * Bu hodisalar uzluksiz emas — sekundiga bir emas, harakat bo'lganda keladi.
 * Shuning uchun ketma-ket hodisalar orasidagi tanaffus belgilangan
 * chegaradan kichik bo'lsa, ular bitta "bor edi" oralig'iga birlashtiriladi.
 *
 * Bu taxminiy hisob: kamera ko'rmagan payt "yo'q edi" degani emas
 * (xodim omborda yoki boshqa xonada bo'lishi mumkin). Shu sababli natija
 * "kamerada ko'rindi" deb ataladi, "ishlamadi" deb emas.
 */

export const GAP_MINUTES = Number(process.env.PRESENCE_GAP_MINUTES || 10);

/**
 * Hodisalarni oraliqlarga birlashtiradi.
 * @param {Array<{at: Date|string, type?: string}>} events — vaqt bo'yicha tartiblangan
 * @param {number} gapMinutes — shu vaqtdan uzun tanaffus "yo'q edi" deb olinadi
 * @returns {Array<{from: Date, to: Date, minutes: number, events: number}>}
 */
export function mergeIntervals(events, gapMinutes = GAP_MINUTES) {
  const gap = gapMinutes * 60_000;
  const points = events
    .map((e) => ({ at: new Date(e.at), type: e.type }))
    .filter((e) => !Number.isNaN(e.at.getTime()))
    .sort((a, b) => a.at - b.at);

  const out = [];
  let current = null;

  for (const p of points) {
    // "absent" hodisasi oraliqni ataylab yopadi
    if (p.type === 'absent') {
      if (current) { out.push(finish(current, gapMinutes)); current = null; }
      continue;
    }
    if (!current) {
      current = { from: p.at, to: p.at, events: 1 };
      continue;
    }
    if (p.at - current.to <= gap) {
      current.to = p.at;
      current.events++;
    } else {
      out.push(finish(current, gapMinutes));
      current = { from: p.at, to: p.at, events: 1 };
    }
  }
  if (current) out.push(finish(current, gapMinutes));
  return out;
}

function finish(interval, gapMinutes = GAP_MINUTES) {
  // Bitta hodisadan iborat oraliq ham nolga teng bo'lib qolmasin:
  // hodisa atrofidagi yarim "gap" oynasini hisobga olamiz.
  const minMinutes = Math.min(gapMinutes / 2, 5);
  const minutes = Math.max((interval.to - interval.from) / 60_000, minMinutes);
  return {
    from: interval.from,
    to: interval.to,
    minutes: Math.round(minutes * 10) / 10,
    events: interval.events,
  };
}

/** Oraliqlar orasidagi uzun tanaffuslar — "ish joyida ko'rinmagan" vaqtlar. */
export function findGaps(intervals, minGapMinutes = 15) {
  const gaps = [];
  for (let i = 1; i < intervals.length; i++) {
    const from = intervals[i - 1].to;
    const to = intervals[i].from;
    const minutes = (new Date(to) - new Date(from)) / 60_000;
    if (minutes >= minGapMinutes) {
      gaps.push({ from, to, minutes: Math.round(minutes) });
    }
  }
  return gaps;
}

/**
 * Bir kunlik davomat: har bir xodim uchun kamerada ko'ringan vaqt va
 * tizimda ochiq bo'lgan sessiya vaqti yonma-yon.
 */
export async function attendanceForDate(date, userId = null) {
  const params = [date];
  let filter = '';
  if (userId) { params.push(userId); filter = `AND e.user_id = $${params.length}`; }

  const events = await many(
    `SELECT e.user_id, e.at, e.type, e.camera_id, c.name AS camera_name
       FROM camera_events e
       LEFT JOIN cameras c ON c.id = e.camera_id
      WHERE e.at::date = $1::date AND e.user_id IS NOT NULL
        AND e.type IN ('face','present','absent') ${filter}
      ORDER BY e.user_id, e.at`,
    params,
  );

  const staff = await many(
    `SELECT u.id, u.full_name, u.role,
            (u.photo_path IS NOT NULL) AS has_photo, u.photo_updated_at,
            coalesce(round(sum(extract(epoch FROM
              coalesce(s.logout_at, s.last_seen_at) - s.login_at))/60.0)::int, 0) AS session_minutes,
            min(s.login_at) AS first_login,
            max(coalesce(s.logout_at, s.last_seen_at)) AS last_activity
       FROM users u
       LEFT JOIN sessions s ON s.user_id = u.id AND s.login_at::date = $1::date
      WHERE u.is_active ${userId ? 'AND u.id = $2' : ''}
      GROUP BY u.id, u.full_name, u.role, u.photo_path, u.photo_updated_at
      ORDER BY u.full_name`,
    userId ? [date, userId] : [date],
  );

  const byUser = new Map();
  for (const e of events) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, []);
    byUser.get(e.user_id).push(e);
  }

  return staff.map((u) => {
    const list = byUser.get(u.id) || [];
    const intervals = mergeIntervals(list);
    const cameraMinutes = Math.round(intervals.reduce((s, i) => s + i.minutes, 0));
    return {
      user_id: u.id,
      full_name: u.full_name,
      role: u.role,
      camera_minutes: cameraMinutes,
      session_minutes: u.session_minutes,
      first_seen: intervals[0]?.from ?? null,
      last_seen: intervals[intervals.length - 1]?.to ?? null,
      first_login: u.first_login,
      last_activity: u.last_activity,
      intervals,
      gaps: findGaps(intervals),
      cameras: [...new Set(list.map((e) => e.camera_name).filter(Boolean))],
    };
  });
}

/** Bitta xodimning kun davomidagi hodisalari (lenta uchun). */
export async function eventsForUserDay(userId, date) {
  return many(
    `SELECT e.id, e.at, e.type, e.confidence, e.face_label, c.name AS camera_name, e.snapshot_path
       FROM camera_events e LEFT JOIN cameras c ON c.id = e.camera_id
      WHERE e.user_id = $1 AND e.at::date = $2::date
      ORDER BY e.at`,
    [userId, date],
  );
}

/** Saqlash muddati tugagan hodisalarni o'chirish (maxfiylik talabi). */
export async function purgeOldEvents(days = Number(process.env.CAMERA_RETENTION_DAYS || 90)) {
  const res = await one(
    `WITH removed AS (
       DELETE FROM camera_events WHERE at < now() - ($1 || ' days')::interval RETURNING 1
     ) SELECT count(*)::int AS c FROM removed`,
    [String(days)],
  );
  return res.c;
}
