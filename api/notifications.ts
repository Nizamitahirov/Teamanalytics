import { listNotifications, markNotificationsRead } from '../server/firestore.js';
import { requireUser, send, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { NotificationsBodySchema } from '../shared/schema.js';

// GET  /api/notifications            → öz bildirişlərim (son 50)
// POST /api/notifications {ids|all}  → oxunmuş kimi işarələ (yalnız özününkü)
export default async function handler(req: Req, res: Res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === 'GET') return send(res, 200, { notifications: await listNotifications(me.id) });
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET və ya POST');
    const b = await parseBody(req, res, NotificationsBodySchema);
    if (!b) return;
    const mine = (await listNotifications(me.id, 300)).filter((n) => !n.read);
    const ids = mine.filter((n) => b.all || b.ids?.includes(n.id)).map((n) => n.id);
    await markNotificationsRead(ids);
    send(res, 200, { ok: true, marked: ids.length });
  } catch (e) {
    fail(res, e);
  }
}
