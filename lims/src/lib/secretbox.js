import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * Kichik sirlarni (kamera paroli kabi) bazada ochiq saqlamaslik uchun
 * AES-256-GCM shifrlash. Kalit JWT sirdan hosil qilinadi.
 *
 * Eslatma: bu bazani o'g'irlashdan himoya qilmaydi (kalit ham shu serverda),
 * lekin zaxira nusxasi yoki jurnal orqali parol tarqab ketishining oldini oladi.
 */

const key = crypto.createHash('sha256').update(`labcore:secretbox:${config.jwtSecret}`).digest();

export function encrypt(plain) {
  if (plain === null || plain === undefined || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), enc.toString('base64')].join('.');
}

export function decrypt(packed) {
  if (!packed) return null;
  try {
    const [iv, tag, data] = String(packed).split('.');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null; // kalit o'zgargan yoki yozuv buzilgan
  }
}
