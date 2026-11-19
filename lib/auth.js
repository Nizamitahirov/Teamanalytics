// Giriş: istifadəçi adları və parollar Vercel mühit dəyişənlərində saxlanır.
//   AUTH_USERS  = "nizami:GucluParol1,aysel:BaskaParol2"
//   AUTH_SECRET = sessiya cookie-sini imzalamaq üçün uzun təsadüfi söz
// Kod həm Edge (middleware), həm də Node (API) mühitində işləyir: yalnız Web Crypto istifadə olunur.

export const COOKIE = 'wfp_session';
const SESSION_HOURS = 12;
const enc = new TextEncoder();

const b64url = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
};

async function hmacKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) throw new Error('AUTH_SECRET mühit dəyişəni təyin edilməyib (ən azı 16 simvol)');
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function parseUsers() {
  const raw = process.env.AUTH_USERS || '';
  const users = {};
  raw.split(/[,\n;]/).map(s => s.trim()).filter(Boolean).forEach(pair => {
    const i = pair.indexOf(':');
    if (i > 0) users[pair.slice(0, i).trim().toLowerCase()] = { name: pair.slice(0, i).trim(), pass: pair.slice(i + 1) };
  });
  return users;
}

// Sabit müddətli müqayisə (vaxta görə parolu təxmin etməyin qarşısını alır)
async function safeEqual(a, b) {
  const key = await hmacKey();
  const [x, y] = await Promise.all([crypto.subtle.sign('HMAC', key, enc.encode(a)), crypto.subtle.sign('HMAC', key, enc.encode(b))]);
  const ax = new Uint8Array(x), ay = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < ax.length; i++) diff |= ax[i] ^ ay[i];
  return diff === 0;
}

export async function checkCredentials(username, password) {
  const u = parseUsers()[String(username || '').trim().toLowerCase()];
  const ok = await safeEqual(String(password || ''), u ? u.pass : '\u0000no-user\u0000');
  return u && ok ? u.name : null;
}

export async function createSession(name) {
  const payload = b64url(enc.encode(JSON.stringify({ u: name, exp: Date.now() + SESSION_HOURS * 3600e3 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

export async function verifySession(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(), fromB64url(sig), enc.encode(payload));
    if (!ok) return null;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    if (!data.exp || data.exp < Date.now()) return null;
    // İstifadəçi AUTH_USERS-dən çıxarılıbsa, sessiya da etibarsızdır
    if (!parseUsers()[String(data.u).toLowerCase()]) return null;
    return data.u;
  } catch { return null; }
}

export function readCookie(header, name = COOKIE) {
  const m = (header || '').split(/;\s*/).find(c => c.startsWith(name + '='));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
}

export function sessionCookie(token, maxAgeSec = SESSION_HOURS * 3600) {
  return `${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;
}
