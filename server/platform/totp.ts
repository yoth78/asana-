import crypto from 'crypto';

/** Minimal TOTP (RFC 6238) helpers — no extra dependency. */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = '';
  for (const b of buf) bits += b.toString(2).padStart(8, '0');
  let out = '';
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    out += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return out;
}

function base32Decode(secret: string): Buffer {
  const cleaned = secret.replace(/=+$/, '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const ch of cleaned) {
    const val = BASE32_ALPHABET.indexOf(ch);
    if (val < 0) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 1_000_000).padStart(6, '0');
}

export function verifyTotp(secret: string, token: string, window = 1): boolean {
  const cleaned = String(token || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(cleaned)) return false;
  const key = base32Decode(secret);
  const timestep = Math.floor(Date.now() / 1000 / 30);
  for (let w = -window; w <= window; w++) {
    if (hotp(key, timestep + w) === cleaned) return true;
  }
  return false;
}

export function buildOtpauthUri(opts: {
  secret: string;
  email: string;
  issuer?: string;
}): string {
  const issuer = encodeURIComponent(opts.issuer || 'Teamflow Platform');
  const label = encodeURIComponent(`${opts.issuer || 'Teamflow Platform'}:${opts.email}`);
  return `otpauth://totp/${label}?secret=${opts.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}
