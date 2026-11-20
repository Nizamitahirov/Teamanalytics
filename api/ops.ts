import { applyOps } from '../server/firestore.js';
import { requireUser, requestIpHash, send, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { OpsBodySchema, type OpsResponse } from '../shared/schema.js';

// POST /api/ops { ops: Op[] } — dəyişiklik partiyası (Zod ilə yoxlanır, yalnız göndərilən sahələr yazılır).
// Cavab: { ok, versions, conflicts } — v2 klienti versiya ziddiyyətlərini buradan alır (SPEC §4.3, §4.4).
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  // Yazmaq yalnız editor və admin üçün (SPEC §2) — viewer → 403
  const user = await requireUser(req, res, 'editor');
  if (!user) return;
  try {
    const b = await parseBody(req, res, OpsBodySchema);
    if (!b) return;
    const r = b.ops.length
      ? await applyOps(b.ops, user.name, { ip_hash: await requestIpHash(req) })
      : { versions: {}, conflicts: [] };
    const out: OpsResponse = { ok: true, ...r };
    send(res, 200, out);
  } catch (e) {
    fail(res, e);
  }
}
