import { runDaily } from '../../server/daily.js';
import { send, sendError, fail, type Req, type Res } from '../../server/http.js';

// Vercel Cron (vercel.json → crons, gündə 1 dəfə). CRON_SECRET təyin olunubsa Vercel onu
// `Authorization: Bearer …` kimi göndərir və yoxlanılır; təyin olunmayıbsa yalnız Vercel cron agenti qəbul olunur.
// İş idempotentdir (eyni gün üzərinə yazır) — təkrar çağırış zərər vermir.
export default async function handler(req: Req, res: Res) {
  const secret = process.env.CRON_SECRET;
  const auth = String(req.headers.authorization ?? '');
  const ua = String(req.headers['user-agent'] ?? '');
  const ok = secret ? auth === `Bearer ${secret}` : /vercel-cron/i.test(ua);
  if (!ok) return sendError(res, 401, 'unauthorized', 'Yalnız planlaşdırılmış iş üçün');
  try {
    send(res, 200, { ok: true, ...(await runDaily()) });
  } catch (e) {
    fail(res, e);
  }
}
