// Giriş: istifadəçilər Firestore-un "users" kolleksiyasında saxlanır (parol PBKDF2-SHA256 ilə heşlənir).
// Kolleksiya boşdursa, ilk istifadəçi avtomatik yaradılır: Ecosystem / Ecosystem.
// Sessiya cookie-si HMAC ilə imzalanır. Açar: AUTH_SECRET, yoxdursa service account açarından törədilir —
// beləliklə Vercel-də yalnız FIREBASE_SERVICE_ACCOUNT kifayətdir.
// (Rollar, sessiya versiyası, kilid — Mərhələ 5, SPEC §10.)
import { getUser, putUser, countUsers, privateKeyMaterial } from './firestore.js';

export const COOKIE = 'wfp_session';
const SESSION_HOURS = 12;
const ITER = 100000;
const enc = new TextEncoder();

// İlk istifadəçi (Ecosystem / Ecosystem) — parolun özü kodda saxlanmır, yalnız heşi
const BOOTSTRAP = {
  id: 'ecosystem',
  name: 'Ecosystem',
  salt: 'DayiMohSRQRSl1g03N4W3A==',
  hash: 'cT3X2VQzni9gfjQyTS3jtGH/dQjVE77tWcUarykuUXw=',
  iter: ITER,
};

const b64 = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString('base64');
const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf as ArrayBuffer).toString('base64url');

let keyPromise: Promise<CryptoKey> | null = null;
function hmacKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = (async () => {
      const material = process.env.AUTH_SECRET
        ? enc.encode(process.env.AUTH_SECRET)
        : await crypto.subtle.digest('SHA-256', enc.encode('wfp-session:' + privateKeyMaterial()));
      return crypto.subtle.importKey('raw', material, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
    })().catch((e) => {
      keyPromise = null;
      throw e;
    });
  }
  return keyPromise;
}
/** Yalnız testlər üçün. */
export function _resetAuthCache(): void {
  keyPromise = null;
}

async function pbkdf2(password: string, saltB64: string, iter = ITER): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(saltB64, 'base64'), iterations: iter },
    key,
    256,
  );
  return b64(bits);
}
function timingSafeEq(a: string, b: string): boolean {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}
export const userId = (name: unknown) =>
  String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[/\s]+/g, '_');

/** Doğrudursa istifadəçinin göstərilən adını qaytarır. */
export async function checkCredentials(username: string, password: string): Promise<string | null> {
  const id = userId(username);
  if (!id || !password) return null;
  let u = await getUser(id);
  if (!u && id === BOOTSTRAP.id && (await countUsers()) === 0) {
    await putUser(BOOTSTRAP.id, {
      name: BOOTSTRAP.name,
      salt: BOOTSTRAP.salt,
      hash: BOOTSTRAP.hash,
      iter: BOOTSTRAP.iter,
      active: true,
      created_by: 'system',
    });
    u = { ...BOOTSTRAP, _id: BOOTSTRAP.id, active: true };
  }
  if (!u || u.active === false) {
    await pbkdf2(String(password), BOOTSTRAP.salt); // vaxt fərqi olmasın
    return null;
  }
  const h = await pbkdf2(String(password), String(u.salt), Number(u.iter) || ITER);
  return timingSafeEq(h, String(u.hash)) ? String(u.name || id) : null;
}

export async function hashPassword(password: string) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pbkdf2(password, salt), iter: ITER };
}

export async function createSession(name: string): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ u: name, exp: Date.now() + SESSION_HOURS * 3600e3 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token: string | null): Promise<string | null> {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), Buffer.from(sig, 'base64url'), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { u?: string; exp?: number };
    return data.exp && data.exp > Date.now() && data.u ? data.u : null;
  } catch {
    return null;
  }
}

export function readCookie(header: string | undefined, name = COOKIE): string | null {
  const m = (header || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export function sessionCookie(token: string, maxAgeSec = SESSION_HOURS * 3600): string {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
