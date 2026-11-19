import { applyOps } from '../server/firestore.js';
import { requireUser, send, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { OpsBodySchema } from '../shared/schema.js';

// POST /api/ops { ops: Op[] } — dəyişiklik partiyası (Zod ilə yoxlanır, yalnız göndərilən sahələr yazılır)
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const b = await parseBody(req, res, OpsBodySchema);
    if (!b) return;
    if (b.ops.length) await applyOps(b.ops, user);
    send(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
