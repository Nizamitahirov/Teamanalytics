import { listUsers, putUser, getUser, deleteUser, applyOps } from '../server/firestore.js';
import { hashPassword, userId } from '../server/auth.js';
import { requireUser, send, sendError, parseBody, methodNotAllowed, fail, type Req, type Res } from '../server/http.js';
import { UsersBodySchema } from '../shared/schema.js';

// İstifadəçilərin idarəsi (Ayarlar → İstifadəçilər). Parollar heş kimi saxlanır, heç vaxt geri qaytarılmır.
// (Rol yoxlaması — Mərhələ 5.)
export default async function handler(req: Req, res: Res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === 'GET') return send(res, 200, { users: await listUsers(), me });
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET və ya POST');
    const b = await parseBody(req, res, UsersBodySchema);
    if (!b) return;
    const { action, name, password } = b;
    const id = userId(name);
    if (!id) return sendError(res, 400, 'invalid_body', 'Ad boş ola bilməz');
    if (action === 'add' || action === 'password') {
      if (!password || password.length < 6) return sendError(res, 400, 'weak_password', 'Parol ən azı 6 simvol olmalıdır');
      const existing = await getUser(id);
      if (action === 'add' && existing) return sendError(res, 409, 'exists', 'Bu adda istifadəçi artıq var');
      if (action === 'password' && !existing) return sendError(res, 404, 'not_found', 'İstifadəçi tapılmadı');
      const h = await hashPassword(password);
      await putUser(id, {
        name: existing ? existing.name : name,
        ...h,
        active: true,
        created_by: existing ? existing.created_by || '' : me,
      });
      const label = action === 'add' ? `${name} əlavə edildi` : `${existing?.name} üçün parol dəyişdirildi`;
      await applyOps([{ t: 'log', row: { action: 'İstifadəçi', task_label: label } }], me);
      return send(res, 200, { ok: true });
    }
    // action === 'remove'
    if (id === userId(me)) return sendError(res, 400, 'self_remove', 'Öz istifadəçinizi silə bilməzsiniz');
    const users = await listUsers();
    if (users.length <= 1) return sendError(res, 400, 'last_user', 'Sonuncu istifadəçini silmək olmaz');
    const u = users.find((x) => x.id === id);
    if (!u) return sendError(res, 404, 'not_found', 'İstifadəçi tapılmadı');
    await deleteUser(id);
    await applyOps([{ t: 'log', row: { action: 'İstifadəçi', task_label: `${u.name} silindi` } }], me);
    send(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
