import net from 'node:net';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { many, one, query } from '../db.js';
import { ageYears, evaluate, pickRange } from './analyzer.js';

/**
 * Laboratoriya uskunalaridan (analizatorlardan) natijani avtomatik olish.
 *
 * Uch xil ulanish qo'llab-quvvatlanadi:
 *   HL7 v2 (MLLP)  — TCP port, ko'pchilik zamonaviy analizatorlar
 *   ASTM E1394     — TCP port, gematologiya va biokimyo uskunalari
 *   Papka          — uskuna natijani CSV/TXT qilib yozadi, biz kuzatamiz
 * Bundan tashqari HTTP orqali vositachi dastur natija yubora oladi.
 *
 * Muhim qoida: uskunadan kelgan natija darhol "tasdiqlangan" bo'lmaydi.
 * U laborant ekranida "uskunadan keldi" belgisi bilan turadi va odam
 * tasdiqlagandan keyingina bemorga chiqadi.
 */

// ---------------------------------------------------------------------------
// Parserlar — har biri { sample, code, value, unit } ro'yxatini qaytaradi
// ---------------------------------------------------------------------------

/**
 * HL7 v2 ORU^R01. Namuna raqami OBR-3 dan, natijalar OBX segmentlaridan.
 *   OBX|1|NM|HGB^Hemoglobin||130|g/L|120-150|N|||F
 */
export function parseHl7(raw) {
  const out = [];
  let sample = null;

  for (const line of String(raw).split(/[\r\n]+/)) {
    const f = line.split('|');
    if (f[0] === 'OBR') {
      sample = clean(f[3]) || sample;
    } else if (f[0] === 'OBX') {
      const code = clean(f[3]?.split('^')[0]);
      const value = clean(f[5]);
      const unit = clean(f[6]);
      if (code && value !== '') out.push({ sample, code, value, unit });
    }
  }
  return out.filter((r) => r.sample);
}

/**
 * ASTM E1394. Namuna raqami O (order) yozuvidan, natijalar R yozuvlaridan.
 *   O|1|2026-000123||^^^HGB|R|20260804
 *   R|1|^^^HGB|130|g/L||N||F||||20260804
 */
export function parseAstm(raw) {
  const out = [];
  let sample = null;

  for (const line of String(raw).split(/[\r\n\x03\x02]+/)) {
    const f = line.replace(/^\d?/, '').split('|');
    const type = f[0]?.replace(/[^A-Z]/g, '');
    if (type === 'O') {
      sample = clean(f[2]) || clean(f[3]) || sample;
    } else if (type === 'R') {
      const parts = (f[2] || '').split('^');
      const code = clean(parts[parts.length - 1]);
      const value = clean(f[3]);
      const unit = clean(f[4]);
      if (code && value !== '') out.push({ sample, code, value, unit });
    }
  }
  return out.filter((r) => r.sample);
}

/**
 * Oddiy CSV: "namuna,kod,qiymat,birlik". Sarlavha qatori bo'lishi mumkin.
 * Sarlavha faqat birinchi ustun aynan sarlavha so'zi bo'lgandagina
 * o'tkazib yuboriladi — "NAMUNA-3" kabi haqiqiy shtrix-kod yo'qolmasin.
 */
const HEADER_WORDS = new Set(['sample', 'barcode', 'namuna', 'shtrix', 'id', '№']);

export function parseCsv(raw) {
  const out = [];
  for (const line of String(raw).split(/[\r\n]+/)) {
    if (!line.trim()) continue;
    const [sample, code, value, unit] = line.split(/[;,\t]/).map((s) => clean(s));
    if (HEADER_WORDS.has(String(sample).toLowerCase())) continue;
    if (sample && code && value !== '' && value !== undefined) out.push({ sample, code, value, unit });
  }
  return out;
}

/**
 * Format xabarning o'zidan aniqlanadi. Uskuna sozlamasida "http" tursa ham,
 * vositachi dastur HL7 yuborishi mumkin — shuning uchun protokolga emas,
 * mazmunga qaraymiz.
 */
export function parseAuto(raw) {
  const text = String(raw);
  if (/(^|[\r\n])MSH\|/.test(text)) return parseHl7(text);
  if (/(^|[\r\n])[0-9]?[HOR]\|/.test(text)) return parseAstm(text);
  return parseCsv(text);
}

const clean = (v) => String(v ?? '').trim();

// ---------------------------------------------------------------------------
// Natijani bazaga yozish
// ---------------------------------------------------------------------------

/**
 * Uskunadan kelgan natijalarni buyurtmalarga bog'laydi.
 * Namuna sifatida probirka shtrix-kodi yoki buyurtma raqami kelishi mumkin.
 */
export async function applyResults(device, items) {
  const applied = [];
  const skipped = [];

  for (const item of items) {
    try {
      const row = await findOrderItem(device, item);
      if (!row) { skipped.push({ ...item, reason: 'mos analiz topilmadi' }); continue; }

      // Odam kiritgan yoki tasdiqlagan natijani uskuna bosib ketmasin.
      if (row.confirmed_at || (row.entered_by !== null && row.entered_by !== undefined)) {
        skipped.push({ ...item, reason: 'natija allaqachon kiritilgan (uskuna yozmadi)' });
        continue;
      }

      const factor = Number(row.factor ?? 1);
      const numeric = Number(String(item.value).replace(',', '.'));
      const isNumber = row.value_type === 'number' && Number.isFinite(numeric);
      const valueNum = isNumber ? numeric * factor : null;
      const valueText = isNumber ? null : String(item.value);

      const ranges = await many('SELECT * FROM test_reference_ranges WHERE test_id = $1', [row.test_id]);
      const range = pickRange(ranges, row.gender, ageYears(row.birth_date));
      const flag = isNumber ? evaluate(valueNum, range) : valueText ? 'normal' : null;

      await query(
        `UPDATE results
            SET value_num = $2, value_text = $3, unit = coalesce($4, unit),
                flag = $5, device = $6, entered_by = NULL, entered_at = now(),
                confirmed_by = NULL, confirmed_at = NULL,
                revision = CASE WHEN entered_at IS NULL THEN 1 ELSE revision + 1 END
          WHERE order_item_id = $1`,
        [row.order_item_id, valueNum, valueText, item.unit || null, flag, device.name],
      );
      await query(`UPDATE order_items SET status = 'entered' WHERE id = $1`, [row.order_item_id]);

      // Uskuna ham auditda ko'rinadi — kim/nima yozgani aniq bo'lsin.
      await query(
        `INSERT INTO audit_log (user_id, user_name, computer_name, action, entity, entity_id,
                                patient_id, description, new_data)
         VALUES (NULL, $1, $2, 'CREATE', 'result', $3, $4, $5, $6)`,
        [
          `Uskuna: ${device.name}`,
          device.name,
          String(row.order_item_id),
          row.patient_id,
          `Uskunadan natija keldi — ${row.test_name}: ${valueText ?? valueNum} ` +
            `(${row.order_number}, tasdiqlash kutilmoqda)`,
          JSON.stringify({ value: valueText ?? valueNum, unit: item.unit, flag, device: device.name }),
        ],
      );

      applied.push({ ...item, order_item_id: row.order_item_id, order_id: row.order_id, flag });
    } catch (err) {
      skipped.push({ ...item, reason: err.message });
    }
  }

  // Buyurtma holatini yangilaymiz
  const orderIds = [...new Set(applied.map((a) => a.order_id).filter(Boolean))];
  for (const id of orderIds) await refreshOrderStatus(id);

  if (applied.length) await query('UPDATE devices SET last_seen_at = now() WHERE id = $1', [device.id]);
  return { applied, skipped };
}

async function findOrderItem(device, item) {
  const row = await one(
    `SELECT oi.id AS order_item_id, oi.order_id, o.order_number, o.patient_id,
            t.id AS test_id, t.name AS test_name, t.value_type,
            p.gender, p.birth_date,
            r.entered_by, r.entered_at, r.confirmed_at,
            m.factor
       FROM order_items oi
       JOIN orders o  ON o.id = oi.order_id
       JOIN patients p ON p.id = o.patient_id
       JOIN test_catalog t ON t.id = oi.test_id
       LEFT JOIN results r ON r.order_item_id = oi.id
       LEFT JOIN device_mappings m ON m.device_id = $1 AND m.test_id = t.id
      WHERE (oi.sample_barcode = $2 OR o.order_number = $2)
        AND o.status <> 'cancelled'
        AND (m.device_code = $3 OR t.code = upper($3))
      ORDER BY o.created_at DESC
      LIMIT 1`,
    [device.id, item.sample, item.code],
  );
  return row;
}

async function refreshOrderStatus(orderId) {
  const stat = await one(
    `SELECT count(*)::int AS total,
            count(*) FILTER (WHERE r.value_num IS NOT NULL OR r.value_text IS NOT NULL)::int AS filled
       FROM order_items oi LEFT JOIN results r ON r.order_item_id = oi.id
      WHERE oi.order_id = $1`,
    [orderId],
  );
  const status = stat.filled === 0 ? 'new' : stat.filled < stat.total ? 'in_progress' : 'ready';
  await query(`UPDATE orders SET status = $2 WHERE id = $1 AND status <> 'cancelled'`, [orderId, status]);
}

/** Xom xabarni saqlab, parslab, natijalarni qo'llaydi. */
export async function ingest(device, raw) {
  const msg = await one(
    'INSERT INTO device_messages (device_id, raw) VALUES ($1,$2) RETURNING id',
    [device.id, String(raw).slice(0, 100_000)],
  );

  try {
    const items = parseAuto(raw);
    if (!items.length) {
      await query(`UPDATE device_messages SET status='ignored', error=$2 WHERE id=$1`, [
        msg.id, 'xabardan natija topilmadi',
      ]);
      return { applied: [], skipped: [], messageId: msg.id };
    }

    const res = await applyResults(device, items);
    const status = res.applied.length === 0 ? 'failed'
      : res.skipped.length ? 'partial' : 'applied';
    await query(
      `UPDATE device_messages SET status=$2, applied_count=$3, error=$4 WHERE id=$1`,
      [
        msg.id, status, res.applied.length,
        res.skipped.length ? res.skipped.map((s) => `${s.code}: ${s.reason}`).join('; ').slice(0, 500) : null,
      ],
    );
    return { ...res, messageId: msg.id };
  } catch (err) {
    await query(`UPDATE device_messages SET status='failed', error=$2 WHERE id=$1`, [
      msg.id, err.message.slice(0, 500),
    ]);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Tinglovchilar
// ---------------------------------------------------------------------------

const listeners = new Map();
const watchers = new Map();

const VT = 0x0b; // MLLP boshlanishi
const FS = 0x1c; // MLLP tugashi

/** HL7/ASTM uchun TCP tinglovchi. */
function startTcpListener(device) {
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);

    socket.on('data', async (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);

      // MLLP: <VT> xabar <FS><CR>
      let start = buffer.indexOf(VT);
      let end = buffer.indexOf(FS);
      while (start !== -1 && end > start) {
        const raw = buffer.subarray(start + 1, end).toString('utf8');
        buffer = buffer.subarray(end + 1);
        await handle(raw, socket, true);
        start = buffer.indexOf(VT);
        end = buffer.indexOf(FS);
      }

      // ASTM yoki oddiy matn: xabar oxiri EOT/ETX yoki bo'sh qatordan keyin
      if (device.protocol === 'astm' && /L\|1\|N/.test(buffer.toString('utf8'))) {
        const raw = buffer.toString('utf8');
        buffer = Buffer.alloc(0);
        await handle(raw, socket, false);
      }
    });

    socket.on('error', (err) => console.error(`[uskuna:${device.name}]`, err.message));
  });

  const handle = async (raw, socket, mllp) => {
    try {
      const res = await ingest(device, raw);
      console.log(`[uskuna:${device.name}] ${res.applied.length} ta natija qabul qilindi`);
      if (mllp) socket.write(Buffer.concat([Buffer.from([VT]), Buffer.from(hl7Ack(raw, 'AA')), Buffer.from([FS, 0x0d])]));
      else socket.write('\x06'); // ASTM ACK
    } catch (err) {
      console.error(`[uskuna:${device.name}] xato:`, err.message);
      if (mllp) socket.write(Buffer.concat([Buffer.from([VT]), Buffer.from(hl7Ack(raw, 'AE')), Buffer.from([FS, 0x0d])]));
      else socket.write('\x15'); // NAK
    }
  };

  server.on('error', (err) => console.error(`[uskuna:${device.name}] port xatosi:`, err.message));
  server.listen(device.port, device.host || '0.0.0.0', () => {
    console.log(`[uskuna:${device.name}] ${device.protocol.toUpperCase()} tinglanmoqda ${device.host || '0.0.0.0'}:${device.port}`);
  });
  listeners.set(device.id, server);
  return server;
}

/** HL7 tasdiq (ACK) xabari. */
function hl7Ack(raw, code) {
  const msh = String(raw).split(/[\r\n]+/).find((l) => l.startsWith('MSH')) || '';
  const f = msh.split('|');
  const controlId = f[9] || '1';
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return (
    `MSH|^~\\&|LABCORE|LAB|${f[2] || 'DEVICE'}|${f[3] || 'LAB'}|${stamp}||ACK|${controlId}|P|2.3.1\r` +
    `MSA|${code}|${controlId}\r`
  );
}

/** Papkani kuzatuvchi: uskuna yozgan faylni o'qib, arxivga ko'chiradi. */
function startFolderWatcher(device) {
  if (!device.folder) return null;
  fs.mkdirSync(device.folder, { recursive: true });
  const done = path.join(device.folder, 'qabul_qilingan');
  fs.mkdirSync(done, { recursive: true });

  const scan = async () => {
    let files;
    try {
      files = await fsp.readdir(device.folder);
    } catch { return; }

    for (const name of files) {
      if (!/\.(csv|txt|dat)$/i.test(name)) continue;
      const full = path.join(device.folder, name);
      try {
        const raw = await fsp.readFile(full, 'utf8');
        const res = await ingest(device, raw);
        await fsp.rename(full, path.join(done, `${Date.now()}_${name}`));
        console.log(`[uskuna:${device.name}] ${name}: ${res.applied.length} ta natija`);
      } catch (err) {
        console.error(`[uskuna:${device.name}] ${name} — xato:`, err.message);
      }
    }
  };

  const timer = setInterval(scan, 5000);
  timer.unref();
  watchers.set(device.id, timer);
  scan();
  console.log(`[uskuna:${device.name}] papka kuzatilmoqda: ${device.folder}`);
  return timer;
}

/** Uskuna sozlamasi o'zgarganini bilish uchun qisqa imzo. */
const signature = (d) => [d.protocol, d.host, d.port, d.folder].join('|');
const running = new Map(); // device_id -> signature

/**
 * Bazadagi faol uskunalar uchun tinglovchilarni ishga tushiradi.
 *
 * Faqat o'zgargani qayta ishga tushadi: yangi uskuna qo'shilganda boshqa
 * analizatorlarning ochiq ulanishi uzilmaydi (o'sha paytda natija
 * yuborayotgan uskuna xabarini yo'qotmasin).
 */
export async function startDeviceListeners() {
  let devices = [];
  try {
    devices = await many('SELECT * FROM devices WHERE is_active');
  } catch {
    return 0; // sxema hali o'rnatilmagan
  }

  const wanted = new Map(devices.map((d) => [d.id, d]));

  // O'chirilgan yoki sozlamasi o'zgargan tinglovchilarni to'xtatamiz
  for (const [id, sig] of [...running]) {
    const d = wanted.get(id);
    if (!d || signature(d) !== sig) await stopOne(id);
  }

  for (const d of devices) {
    if (running.has(d.id)) continue;
    try {
      if ((d.protocol === 'hl7' || d.protocol === 'astm') && d.port) {
        startTcpListener(d);
        running.set(d.id, signature(d));
      } else if (d.protocol === 'folder' && d.folder) {
        startFolderWatcher(d);
        running.set(d.id, signature(d));
      }
    } catch (err) {
      console.error(`[uskuna:${d.name}] ishga tushmadi:`, err.message);
    }
  }
  return running.size;
}

async function stopOne(id) {
  const server = listeners.get(id);
  if (server) {
    await new Promise((r) => server.close(r));
    listeners.delete(id);
  }
  const timer = watchers.get(id);
  if (timer) { clearInterval(timer); watchers.delete(id); }
  running.delete(id);
}

export async function stopDeviceListeners() {
  for (const id of [...running.keys()]) await stopOne(id);
  listeners.clear();
  watchers.clear();
  running.clear();
}
