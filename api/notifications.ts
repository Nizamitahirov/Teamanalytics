import { markNotificationsRead } from '../server/firestore.js';
import { requireUser, send, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { NotificationsBodySchema } from '../shared/schema.js';

// POST /api/notifications { action: 'read', ids } | { action: 'read-all' } → { ok, n }
// Bildirişlərin özü /api/data ilə gəlir (deltada — ayrıca sorğu yoxdur). Hər kəs yalnız ÖZ bildirişini dəyişə bilər.
export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    const b = await parseBody(req, res, NotificationsBodySchema);
    if (!b) return;
    const n = await markNotificationsRead(me.name, b.action === 'read-all' ? 'all' : b.ids);
    send(res, 200, { ok: true, n });
  } catch (e) {
    fail(res, e);
  }
}
