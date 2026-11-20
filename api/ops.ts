import { applyOps, getMeta, getTasks, settingsOf } from '../server/firestore.js';
import {
  requireUser,
  requestIpHash,
  send,
  sendError,
  parseBody,
  methodNotAllowed,
  fail,
  type Req,
  type Res,
} from '../server/http.js';
import { DEFAULT_SETTINGS, OpsBodySchema, type Op, type OpsResponse } from '../shared/schema.js';

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
    if (user.role === 'editor') {
      const hours = await transferHoursOverLimit(b.ops);
      if (hours != null)
        return sendError(
          res,
          403,
          'approval_required',
          `${Math.round(hours)} saatlıq ötürmə administrator təsdiqi tələb edir — ssenari kimi təsdiqə göndərin`,
        );
    }
    const r = b.ops.length
      ? await applyOps(b.ops, user.name, { ip_hash: await requestIpHash(req) })
      : { versions: {}, conflicts: [] };
    const out: OpsResponse = { ok: true, ...r };
    send(res, 200, out);
  } catch (e) {
    fail(res, e);
  }
}

/**
 * Təsdiq axını (SPEC §2): ayar açıqdırsa, editor-un bir partiyadakı ötürmələrinin cəmi həddi aşırsa → saat, yoxsa null.
 * Ötürmə yoxdursa heç nə oxunmur; varsa meta (1) + ötürülən tapşırıqlar (N) oxunur.
 */
async function transferHoursOverLimit(ops: Op[]): Promise<number | null> {
  const moves = ops.filter(
    (op): op is Extract<Op, { t: 'upsert'; table: 'Tasks' }> =>
      op.t === 'upsert' && op.table === 'Tasks' && 'owner_after' in op.row,
  );
  if (!moves.length) return null;
  const s = { ...DEFAULT_SETTINGS, ...(settingsOf(await getMeta()) as Record<string, number>) };
  if (Number(s.approval) !== 1) return null;
  const current = await getTasks([...new Set(moves.map((op) => String(op.row.id)))]);
  let hours = 0;
  for (const op of moves) {
    const t = current.get(String(op.row.id));
    if (!t || t.is_cancelled || t._deleted) continue;
    const owner = String(t.owner_after || t.owner_before || '').trim();
    if (owner !== String(op.row.owner_after ?? '').trim()) hours += Number(t.hours) || 0;
  }
  return hours > Number(s.approval_hours) ? hours : null;
}
