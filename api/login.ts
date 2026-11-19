import { checkCredentials, createSession, sessionCookie } from '../server/auth.js';
import { send, sendError, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { LoginBodySchema } from '../shared/schema.js';

// Sadə qoruma: eyni IP-dən qısa müddətdə çoxlu yanlış cəhd (Firestore-da kilid — Mərhələ 5)
const attempts = new Map<string, { n: number; t: number }>();

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  try {
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'x';
    const a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 10 * 60e3) {
      a.n = 0;
      a.t = Date.now();
    }
    if (a.n >= 10) return sendError(res, 429, 'too_many_attempts', 'Çox sayda yanlış cəhd. 10 dəqiqə sonra yenidən yoxlayın.');
    const b = await parseBody(req, res, LoginBodySchema);
    if (!b) return;
    const name = await checkCredentials(b.username, b.password);
    if (!name) {
      a.n++;
      attempts.set(ip, a);
      await new Promise((r) => setTimeout(r, 400));
      return sendError(res, 401, 'bad_credentials', 'Ad və ya parol yanlışdır');
    }
    attempts.delete(ip);
    send(res, 200, { ok: true, user: name }, { 'Set-Cookie': sessionCookie(await createSession(name)) });
  } catch (e) {
    fail(res, e);
  }
}
