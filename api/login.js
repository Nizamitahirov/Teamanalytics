import { checkCredentials, createSession, sessionCookie } from '../lib/auth.js';
import { send, body, fail } from '../lib/http.js';

// Sadə qoruma: eyni IP-dən qısa müddətdə çoxlu yanlış cəhd
const attempts = new Map();

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST gözlənilir' });
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
    const a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 10 * 60e3) { a.n = 0; a.t = Date.now(); }
    if (a.n >= 10) return send(res, 429, { error: 'Çox sayda yanlış cəhd. 10 dəqiqə sonra yenidən yoxlayın.' });
    const { username, password } = await body(req);
    const name = await checkCredentials(username, password);
    if (!name) {
      a.n++; attempts.set(ip, a);
      await new Promise(r => setTimeout(r, 400));
      return send(res, 401, { error: 'Ad və ya parol yanlışdır' });
    }
    attempts.delete(ip);
    send(res, 200, { ok: true, user: name }, { 'Set-Cookie': sessionCookie(await createSession(name)) });
  } catch (e) { fail(res, e); }
}
