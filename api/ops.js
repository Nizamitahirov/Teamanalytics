import { applyOps, replaceAll } from '../lib/sheets.js';
import { requireUser, send, body, fail } from '../lib/http.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST gözlənilir' });
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const b = await body(req);
    if (b.replace) await replaceAll(b.replace, user);
    const ops = Array.isArray(b.ops) ? b.ops : [];
    if (ops.length) await applyOps(ops, user);
    send(res, 200, { ok: true });
  } catch (e) { fail(res, e); }
}
