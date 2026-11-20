import { createSession, login, sessionCookies } from '../server/auth.js';
import { clientIp, csrfOk, send, sendError, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { LoginBodySchema } from '../shared/schema.js';

// Əlavə qoruma: eyni IP-dən çoxlu yanlış cəhd (instansiya yaddaşında). Əsas kilid Firestore-da (istifadəçi üzrə).
const attempts = new Map<string, { n: number; t: number }>();

// POST /api/login { username, password, remember? } → { ok, user, role, mustChange } + cookie (SPEC §6.1, §10)
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!csrfOk(req)) return sendError(res, 403, 'csrf', 'Sorğu başqa saytdan gəlib və rədd edildi');
  try {
    const ip = clientIp(req);
    const a = attempts.get(ip) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 10 * 60e3) {
      a.n = 0;
      a.t = Date.now();
    }
    if (a.n >= 20) return sendError(res, 429, 'too_many_attempts', 'Çox sayda yanlış cəhd. 10 dəqiqə sonra yenidən yoxlayın.');
    const b = await parseBody(req, res, LoginBodySchema);
    if (!b) return;
    const r = await login(b.username, b.password);
    if (!r.ok) {
      a.n++;
      attempts.set(ip, a);
      await new Promise((ok) => setTimeout(ok, 400));
      if (r.code === 'locked') return send(res, 423, { error: 'Hesab müvəqqəti kilidlənib', code: 'locked', until: r.until });
      return sendError(res, 401, 'bad_credentials', 'Ad və ya parol yanlışdır');
    }
    attempts.delete(ip);
    const s = await createSession(r.user, b.remember === true);
    send(
      res,
      200,
      { ok: true, user: r.user.name, role: r.user.role, mustChange: r.user.mustChange },
      { 'Set-Cookie': sessionCookies(s.token, s.maxAge) },
    );
  } catch (e) {
    fail(res, e);
  }
}
