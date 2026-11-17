// Mật khẩu (scrypt), phiên, giới hạn đăng nhập sai.
import crypto from 'node:crypto';

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

/** Bản không chặn luồng chính: băm mật khẩu chạy trong nhóm luồng của Node (nhiều học sinh đăng nhập cùng lúc không làm treo máy chủ). */
export function verifyPasswordAsync(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return Promise.resolve(false);
  const ref = Buffer.from(hash, 'base64');
  return new Promise((resolve) => {
    crypto.scrypt(String(pw), Buffer.from(salt, 'base64'), 32, { N: 16384, r: 8, p: 1 }, (err, h) => resolve(!err && h.length === ref.length && crypto.timingSafeEqual(h, ref)));
  });
}

export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const h = crypto.scryptSync(String(pw), Buffer.from(salt, 'base64'), 32, { N: 16384, r: 8, p: 1 });
  const ref = Buffer.from(hash, 'base64');
  return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}

export function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

/** Mật khẩu tạm dễ đọc cho học sinh (không có ký tự dễ nhầm). */
export function tempPassword() {
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  const b = crypto.randomBytes(8);
  for (const x of b) s += abc[x % abc.length];
  return s;
}

export class LoginLimiter {
  constructor(max = 5, windowMs = 10 * 60 * 1000, maxEntries = 10000) {
    this.max = max;
    this.windowMs = windowMs;
    this.maxEntries = maxEntries;
    this.fails = new Map();
  }
  prune(now = Date.now()) {
    for (const [k, list] of this.fails) {
      const fresh = list.filter((t) => now - t < this.windowMs);
      if (fresh.length) this.fails.set(k, fresh);
      else this.fails.delete(k);
    }
    while (this.fails.size >= this.maxEntries) {
      const oldest = this.fails.keys().next().value;
      if (oldest === undefined) break;
      this.fails.delete(oldest);
    }
  }
  blocked(key, now = Date.now()) {
    const f = (this.fails.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (f.length) this.fails.set(key, f);
    else this.fails.delete(key);
    return f.length >= this.max;
  }
  fail(key, now = Date.now()) {
    if (!this.fails.has(key) && this.fails.size >= this.maxEntries) this.prune(now);
    const f = (this.fails.get(key) ?? []).filter((t) => now - t < this.windowMs);
    f.push(now);
    this.fails.set(key, f);
  }
  reset(key) {
    this.fails.delete(key);
  }
}

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function safeCsvCell(value) {
  let s = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function sanitizeFilename(name, fallback = 'tep-tai-ve') {
  const cleaned = String(name ?? '')
    .replace(/[\r\n\0"\\/;]+/g, '-')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120);
  return cleaned || fallback;
}

export function posInt(value) {
  const s = String(value ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}

export function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) {
      const k = part.slice(0, i).trim();
      const raw = part.slice(i + 1).trim();
      try {
        out[k] = decodeURIComponent(raw);
      } catch {
        out[k] = raw;
      }
    }
  }
  return out;
}
