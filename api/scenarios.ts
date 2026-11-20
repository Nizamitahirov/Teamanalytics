import {
  applyOps,
  deleteScenario,
  getMeta,
  getScenario,
  listNotifications,
  listScenarios,
  listUsers,
  putScenario,
  settingsOf,
  type NotificationInput,
} from '../server/firestore.js';
import { hasRole } from '../server/auth.js';
import { requireUser, send, sendError, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { DEFAULT_SETTINGS, ScenariosBodySchema } from '../shared/schema.js';

/**
 * Ssenarilər (SPEC §6.5, §4.4). Ssenari canlı dataya YAZMIR — yalnız `scenarios` kolleksiyasına.
 * Tətbiq klientdə adi sinxron axını (/api/ops) ilə olur, sonra `applied` statusu buradan qeyd olunur.
 *   GET  → { scenarios, notifications } (viewer+)
 *   POST create / update / delete / archive / restore / submit (editor+), reject (admin), applied (editor+;
 *        təsdiq axını açıqdırsa yalnız admin)
 */
export default async function handler(req: Req, res: Res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === 'GET') {
      const [scenarios, notifications] = await Promise.all([listScenarios(), listNotifications(me.id)]);
      return send(res, 200, { scenarios, notifications });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET və ya POST');
    if (!hasRole(me.role, 'editor')) return sendError(res, 403, 'forbidden', 'Bu əməliyyat üçün icazəniz yoxdur');
    const b = await parseBody(req, res, ScenariosBodySchema);
    if (!b) return;
    const now = new Date().toISOString();
    const isAdmin = me.role === 'admin';

    if (b.action === 'create') {
      if (await getScenario(b.id)) return sendError(res, 409, 'exists', 'Bu id ilə ssenari artıq var');
      await putScenario(b.id, {
        name: b.name,
        description: b.description ?? '',
        status: 'draft',
        created_by: me.name,
        created_at: now,
        updated_at: now,
        base_ts: b.base_ts ?? '',
        changes: b.changes,
      });
      return send(res, 200, { ok: true, id: b.id });
    }

    const sc = await getScenario(b.id);
    if (!sc) return sendError(res, 404, 'not_found', 'Ssenari tapılmadı');
    const own = sc.created_by === me.name;
    const status = String(sc.status);
    const link = `/scenarios/${sc.id}`;
    // Müəllif və ya admin: redaktə, silmə, arxiv
    const mayManage = own || isAdmin;

    if (b.action === 'update') {
      if (!mayManage) return sendError(res, 403, 'forbidden', 'Yalnız müəllif və ya administrator dəyişə bilər');
      if (status !== 'draft') return sendError(res, 409, 'not_editable', 'Yalnız qaralama ssenari dəyişdirilə bilər');
      await putScenario(sc.id, {
        ...(b.name !== undefined ? { name: b.name } : {}),
        ...(b.description !== undefined ? { description: b.description } : {}),
        ...(b.changes !== undefined ? { changes: b.changes } : {}),
        updated_at: now,
      });
      return send(res, 200, { ok: true });
    }
    if (b.action === 'delete') {
      if (!mayManage) return sendError(res, 403, 'forbidden', 'Yalnız müəllif və ya administrator silə bilər');
      await deleteScenario(sc.id);
      return send(res, 200, { ok: true });
    }
    if (b.action === 'archive' || b.action === 'restore') {
      if (!mayManage) return sendError(res, 403, 'forbidden', 'Yalnız müəllif və ya administrator');
      await putScenario(sc.id, { status: b.action === 'archive' ? 'archived' : 'draft', updated_at: now });
      return send(res, 200, { ok: true });
    }
    if (b.action === 'submit') {
      if (status !== 'draft') return sendError(res, 409, 'bad_status', 'Yalnız qaralama təsdiqə göndərilə bilər');
      const admins = (await listUsers()).filter((u) => u.active && u.role === 'admin' && u.id !== me.id);
      const notify: NotificationInput[] = admins.map((u) => ({
        to: u.id,
        kind: 'approval_request',
        text: `${me.name} "${sc.name}" ssenarisini təsdiqə göndərdi${b.comment ? ': ' + b.comment : ''}`,
        link,
        from: me.name,
      }));
      await putScenario(sc.id, { status: 'pending', submitted_by: me.name, updated_at: now }, notify);
      await applyOps([{ t: 'log', row: { action: 'Ssenari', task_label: `"${sc.name}" təsdiqə göndərildi` } }], me.name);
      return send(res, 200, { ok: true, notified: notify.length });
    }
    const author = String(sc.submitted_by || sc.created_by || '');
    const toAuthor = async (kind: string, text: string): Promise<NotificationInput[]> => {
      if (!author || author === me.name) return [];
      const u = (await listUsers()).find((x) => x.name === author);
      return u ? [{ to: u.id, kind, text, link, from: me.name }] : [];
    };
    if (b.action === 'reject') {
      if (!isAdmin) return sendError(res, 403, 'forbidden', 'Yalnız administrator rədd edə bilər');
      if (status !== 'pending') return sendError(res, 409, 'bad_status', 'Ssenari təsdiq gözləmir');
      const notify = await toAuthor('rejected', `"${sc.name}" rədd edildi${b.comment ? ': ' + b.comment : ''}`);
      await putScenario(sc.id, { status: 'draft', review_comment: b.comment ?? '', updated_at: now }, notify);
      await applyOps(
        [{ t: 'log', row: { action: 'Ssenari', task_label: `"${sc.name}" rədd edildi`, comment: b.comment ?? '' } }],
        me.name,
      );
      return send(res, 200, { ok: true });
    }
    // applied
    if (status !== 'draft' && status !== 'pending')
      return sendError(res, 409, 'bad_status', 'Ssenari artıq tətbiq edilib və ya arxivdədir');
    const settings = { ...DEFAULT_SETTINGS, ...(settingsOf(await getMeta()) as Record<string, number>) };
    if (Number(settings.approval) === 1 && !isAdmin)
      return sendError(res, 403, 'approval_required', 'Təsdiq axını açıqdır — ssenarini təsdiqə göndərin');
    const notify = await toAuthor(
      status === 'pending' ? 'approved' : 'applied',
      `"${sc.name}" ${status === 'pending' ? 'təsdiqləndi və ' : ''}tətbiq edildi (${me.name})`,
    );
    await putScenario(sc.id, { status: 'applied', applied_by: me.name, applied_at: now, updated_at: now }, notify);
    send(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
