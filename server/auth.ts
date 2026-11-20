// Giriş və sessiya (SPEC §10).
// İstifadəçilər Firestore-un "users" kolleksiyasında (parol PBKDF2-SHA256). Kolleksiya boşdursa ilk istifadəçi
// avtomatik yaradılır: Ecosystem / Ecosystem (ilk girişdə parolu dəyişmək məcburidir).
// Sessiya cookie-si HMAC ilə imzalanır: { u: ad, id, role, sv: sessiya versiyası, exp }.
// `sv` ≠ users.session_version → sessiya etibarsızdır (parol dəyişəndə, istifadəçi silinəndə, "sessiyaları ləğv et").
// İstifadəçi sənədi hər sorğuda yox, instansiyada 60 s keşlənir (oxuma büdcəsi).
// Açar: AUTH_SECRET, yoxdursa service account açarından törədilir — Vercel-də yalnız FIREBASE_SERVICE_ACCOUNT kifayətdir.
import { getUser, putUser, countUsers, privateKeyMaterial, type Doc } from './firestore.js';
import { COMMON_PASSWORDS } from './commonPasswords.js';
import type { Role } from '../shared/schema.js';

export const COOKIE = '__Host-wfp_session';
/** v1 dövrünün cookie adı — keçid dövründə oxunur, çıxışda silinir. */
export const LEGACY_COOKIE = 'wfp_session';
export const SESSION_HOURS = 12;
export const REMEMBER_DAYS = 7;
export const LOCK_AFTER = 5;
export const LOCK_MINUTES = 15;
export const MIN_PASSWORD = 10;
const USER_CACHE_MS = 60_000;
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
async function secretMaterial(): Promise<ArrayBuffer> {
  if (process.env.AUTH_SECRET) return new Uint8Array(enc.encode(process.env.AUTH_SECRET)).buffer as ArrayBuffer;
  return crypto.subtle.digest('SHA-256', enc.encode('wfp-session:' + privateKeyMaterial()));
}
function hmacKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    keyPromise = secretMaterial()
      .then((m) => crypto.subtle.importKey('raw', m, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']))
      .catch((e) => {
        keyPromise = null;
        throw e;
      });
  }
  return keyPromise;
}
/** Yalnız testlər üçün. */
export function _resetAuthCache(): void {
  keyPromise = null;
  userCache.clear();
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

/* ---------- rollar ---------- */
const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
/** Rol sahəsi hələ yazılmayıbsa (miqrasiyadan əvvəl) istifadəçi `admin` sayılır (SPEC §2). */
export const roleOf = (u: Doc | null | undefined): Role =>
  u?.role === 'viewer' || u?.role === 'editor' || u?.role === 'admin' ? u.role : 'admin';
export const hasRole = (role: Role, min: Role) => RANK[role] >= RANK[min];

/* ---------- istifadəçi keşi (60 s) ---------- */
const userCache = new Map<string, { doc: Doc | null; at: number }>();
export async function loadUser(id: string, fresh = false): Promise<Doc | null> {
  const c = userCache.get(id);
  if (!fresh && c && Date.now() - c.at < USER_CACHE_MS) return c.doc;
  const doc = await getUser(id);
  userCache.set(id, { doc, at: Date.now() });
  return doc;
}
export const invalidateUser = (id: string) => userCache.delete(id);
/** İstifadəçi sənədində yalnız verilən sahələri yazır və keşi təmizləyir. */
export async function patchUser(id: string, data: Record<string, unknown>) {
  await putUser(id, data);
  invalidateUser(id);
}

/* ---------- parol siyasəti ---------- */
export type PasswordProblem = 'too_short' | 'common' | 'same_as_name' | null;
export function passwordProblem(password: string, name = ''): PasswordProblem {
  if (password.length < MIN_PASSWORD) return 'too_short';
  const p = password.toLowerCase();
  if (
    COMMON_PASSWORDS.has(p) ||
    /^(.)\1+$/.test(p) ||
    ['ecosystem', 'birbank', 'pashapay', 'workforce'].some((w) => p.startsWith(w) && p.length - w.length < 4)
  )
    return 'common';
  const n = userId(name).replace(/_/g, '');
  if (n.length >= 3 && p.includes(n)) return 'same_as_name';
  return null;
}

export async function hashPassword(password: string) {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, hash: await pbkdf2(password, salt), iter: ITER };
}
export async function verifyPassword(u: Doc, password: string): Promise<boolean> {
  const h = await pbkdf2(String(password), String(u.salt), Number(u.iter) || ITER);
  return timingSafeEq(h, String(u.hash));
}

/* ---------- giriş ---------- */
export type UserInfo = { name: string; id: string; role: Role; sv: number; mustChange: boolean };
export type LoginResult =
  { ok: true; user: UserInfo } | { ok: false; code: 'bad_credentials' } | { ok: false; code: 'locked'; until: string };

const isDefaultPassword = (u: Doc) => u._id === BOOTSTRAP.id && u.hash === BOOTSTRAP.hash;
const infoOf = (u: Doc): UserInfo => ({
  name: String(u.name || u._id),
  id: u._id,
  role: roleOf(u),
  sv: Number(u.session_version) || 0,
  // İlkin Ecosystem/Ecosystem parolu ilə giriş və ya admin parolu sıfırlayıb → dəyişmək məcburidir (SPEC §10)
  mustChange: u.must_change_password === true || isDefaultPassword(u),
});

/**
 * Ad/parol yoxlaması + Firestore-da kilid (5 yanlış cəhd → 15 dəq). Yanlış ad və ya parol üçün eyni cavab
 * (hansının səhv olduğu deyilmir). Uğurlu girişdə sayğac sıfırlanır, last_login yazılır.
 */
export async function login(username: string, password: string, now = Date.now()): Promise<LoginResult> {
  const id = userId(username);
  if (!id || !password) return { ok: false, code: 'bad_credentials' };
  let u = await loadUser(id, true);
  if (!u && id === BOOTSTRAP.id && (await countUsers()) === 0) {
    const doc = {
      name: BOOTSTRAP.name,
      salt: BOOTSTRAP.salt,
      hash: BOOTSTRAP.hash,
      iter: BOOTSTRAP.iter,
      active: true,
      created_by: 'system',
      role: 'admin',
      must_change_password: true,
    };
    await patchUser(BOOTSTRAP.id, doc);
    u = { ...doc, _id: BOOTSTRAP.id };
  }
  if (!u || u.active === false) {
    await pbkdf2(String(password), BOOTSTRAP.salt); // vaxt fərqi olmasın
    return { ok: false, code: 'bad_credentials' };
  }
  const lockedUntil = u.locked_until ? Date.parse(String(u.locked_until)) : 0;
  if (lockedUntil > now) return { ok: false, code: 'locked', until: new Date(lockedUntil).toISOString() };
  if (!(await verifyPassword(u, password))) {
    const n = (Number(u.failed_attempts) || 0) + 1;
    if (n >= LOCK_AFTER) {
      const until = new Date(now + LOCK_MINUTES * 60e3).toISOString();
      await patchUser(id, { failed_attempts: 0, locked_until: until });
      return { ok: false, code: 'locked', until };
    }
    await patchUser(id, { failed_attempts: n });
    return { ok: false, code: 'bad_credentials' };
  }
  await patchUser(id, { failed_attempts: 0, locked_until: null, last_login: new Date(now).toISOString() });
  return { ok: true, user: infoOf(u) };
}

/* ---------- sessiya ---------- */
type Payload = { u: string; id?: string; role?: Role; sv?: number; exp: number };

export async function createSession(
  info: Pick<UserInfo, 'name' | 'id' | 'role' | 'sv'>,
  remember = false,
): Promise<{ token: string; maxAge: number }> {
  const maxAge = remember ? REMEMBER_DAYS * 86400 : SESSION_HOURS * 3600;
  const p: Payload = { u: info.name, id: info.id, role: info.role, sv: info.sv, exp: Date.now() + maxAge * 1000 };
  const payload = b64url(enc.encode(JSON.stringify(p)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
  return { token: `${payload}.${b64url(sig)}`, maxAge };
}

/** Yalnız imza və müddət yoxlaması (DB-yə baxmır). */
export async function verifyToken(token: string | null): Promise<Payload | null> {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), Buffer.from(sig, 'base64url'), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Payload;
    return data.exp && data.exp > Date.now() && data.u ? data : null;
  } catch {
    return null;
  }
}

/**
 * Tam yoxlama: imza + müddət + istifadəçi mövcuddur, aktivdir, sessiya versiyası uyğundur.
 * Rol həmişə bazadan (keşdən) götürülür — rol dəyişikliyi ≤ 60 s-də qüvvəyə minir.
 */
export async function validateSession(token: string | null): Promise<UserInfo | null> {
  const p = await verifyToken(token);
  if (!p) return null;
  const id = p.id ?? userId(p.u);
  const u = await loadUser(id);
  if (!u || u.active === false) return null;
  const info = infoOf(u);
  if ((p.sv ?? 0) !== info.sv) return null;
  return info;
}

/** Bütün sessiyaları etibarsız edir (session_version + 1). */
export async function revokeSessions(id: string): Promise<number> {
  const u = await loadUser(id, true);
  const sv = (Number(u?.session_version) || 0) + 1;
  await patchUser(id, { session_version: sv });
  return sv;
}

export function readCookie(header: string | undefined, name = COOKIE): string | null {
  const m = (header || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}
export const readSessionCookie = (header: string | undefined) => readCookie(header, COOKIE) ?? readCookie(header, LEGACY_COOKIE);

/** `__Host-` prefiksi: Secure, Path=/, Domain yoxdur — subdomen cookie ilə əvəz edilə bilməz. */
export function sessionCookies(token: string, maxAgeSec: number): string[] {
  return [
    `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`,
    // köhnə cookie-ni təmizlə
    `${LEGACY_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  ];
}
export const clearCookies = () => sessionCookies('', 0);

/** Audit üçün IP heşi (SHA-256, duzlu) — IP-nin özü saxlanmır (SPEC §10). */
export async function ipHash(ip: string): Promise<string> {
  const salt = Buffer.from(new Uint8Array(await secretMaterial())).toString('base64');
  const d = await crypto.subtle.digest('SHA-256', enc.encode(`ip:${salt}:${ip}`));
  return Buffer.from(d).toString('hex').slice(0, 16);
}
