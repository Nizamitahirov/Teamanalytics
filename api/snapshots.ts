import { bakuDate, getSnapshots, listBackups, readBackup, runDaily } from '../server/daily.js';
import { requireUser, send, sendError, methodNotAllowed, fail, parseBody, type Req, type Res } from '../server/http.js';
import { z } from 'zod';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// GET  /api/snapshots?from=&to=   → { snapshots } — trend datası (hamı; ≤ 400 gün)
// GET  /api/snapshots?backups=1   → { backups }   — backup siyahısı (admin)
// GET  /api/snapshots?backup=DATE → { backup }    — backup məzmunu bərpa önizləməsi üçün (admin)
// POST /api/snapshots { action: 'run' } → snapshot + backup indi (admin, "İndi backup et")
// (Vercel pulsuz planında funksiya sayı ≤ 12 — backup-lar ayrıca endpoint deyil.)
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'GET' && req.method !== 'POST') return methodNotAllowed(res, 'GET və ya POST');
  const q = new URL(req.url || '/', 'http://x').searchParams;
  const adminOnly = req.method === 'POST' || q.has('backups') || q.has('backup');
  const me = await requireUser(req, res, adminOnly ? 'admin' : 'viewer');
  if (!me) return;
  try {
    if (req.method === 'POST') {
      const b = await parseBody(req, res, z.object({ action: z.literal('run') }));
      if (!b) return;
      return send(res, 200, { ok: true, ...(await runDaily()) });
    }
    if (q.has('backups')) return send(res, 200, { backups: await listBackups() });
    const date = q.get('backup');
    if (date) {
      if (!DATE.test(date)) return sendError(res, 400, 'invalid_date', 'Tarix YYYY-MM-DD formatında olmalıdır');
      const backup = await readBackup(date);
      if (!backup) return sendError(res, 404, 'not_found', 'Backup tapılmadı');
      return send(res, 200, { backup });
    }
    const to = q.get('to') || bakuDate();
    const from = q.get('from') || bakuDate(Date.now() - 90 * 864e5);
    if (!DATE.test(from) || !DATE.test(to) || from > to) return sendError(res, 400, 'invalid_date', 'Yanlış tarix aralığı');
    send(res, 200, { snapshots: await getSnapshots(from, to) });
  } catch (e) {
    fail(res, e);
  }
}
