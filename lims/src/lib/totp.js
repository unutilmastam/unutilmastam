import crypto from 'node:crypto';

/**
 * Ikki bosqichli login uchun TOTP (RFC 6238, SHA-1, 6 raqam, 30 soniya).
 * Google Authenticator / Microsoft Authenticator bilan mos.
 * Tashqi kutubxonasiz — faqat node:crypto.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateSecret(bytes = 20) {
  return base32Encode(crypto.randomBytes(bytes));
}

export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  const clean = str.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Noto‘g‘ri base32 belgi');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secretBuf, counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secretBuf).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function generateToken(secret, at = Date.now()) {
  return hotp(base32Decode(secret), Math.floor(at / 1000 / 30));
}

/** Soat farqiga chidamli tekshiruv (±1 oyna = ±30 soniya). */
export function verifyToken(secret, token, window = 1) {
  if (!token || !/^\d{6}$/.test(String(token).trim())) return false;
  const counter = Math.floor(Date.now() / 1000 / 30);
  const buf = base32Decode(secret);
  const given = Buffer.from(String(token).trim());
  for (let i = -window; i <= window; i++) {
    const expected = Buffer.from(hotp(buf, counter + i));
    if (expected.length === given.length && crypto.timingSafeEqual(expected, given)) return true;
  }
  return false;
}

/** Authenticator ilovasi uchun otpauth:// havolasi (QR kodga aylantiriladi). */
export function provisioningUri(secret, username, issuer) {
  const label = encodeURIComponent(`${issuer}:${username}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' });
  return `otpauth://totp/${label}?${params}`;
}
