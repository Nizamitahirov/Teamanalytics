import { listUsers, putUser, getUser, deleteUser, applyOps } from '../lib/firestore.js';
import { hashPassword, userId } from '../lib/auth.js';
import { requireUser, send, body, fail } from '../lib/http.js';

// İstifadəçilərin idarəsi (Ayarlar → İstifadəçilər). Parollar heş kimi saxlanır, heç vaxt geri qaytarılmır.
export default async function handler(req, res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === 'GET') return send(res, 200, { users: await listUsers(), me });
    if (req.method !== 'POST') return send(res, 405, { error: 'GET və ya POST gözlənilir' });
    const { action, name, password } = await body(req);
    const id = userId(name);
    if (!id) return send(res, 400, { error: 'Ad boş ola bilməz' });
    if (action === 'add' || action === 'password') {
      if (!password || String(password).length < 6) return send(res, 400, { error: 'Parol ən azı 6 simvol olmalıdır' });
      const existing = await getUser(id);
      if (action === 'add' && existing) return send(res, 409, { error: 'Bu adda istifadəçi artıq var' });
      if (action === 'password' && !existing) return send(res, 404, { error: 'İstifadəçi tapılmadı' });
      const h = await hashPassword(String(password));
      await putUser(id, { name: existing ? existing.name : String(name).trim(), ...h, active: true, created_by: existing ? existing.created_by || '' : me });
      await applyOps([{ t: 'log', row: { action: 'İstifadəçi', task_label: action === 'add' ? `${String(name).trim()} əlavə edildi` : `${existing.name} üçün parol dəyişdirildi` } }], me);
      return send(res, 200, { ok: true });
    }
    if (action === 'remove') {
      if (id === userId(me)) return send(res, 400, { error: 'Öz istifadəçinizi silə bilməzsiniz' });
      const users = await listUsers();
      if (users.length <= 1) return send(res, 400, { error: 'Sonuncu istifadəçini silmək olmaz' });
      const u = users.find(x => x.id === id);
      if (!u) return send(res, 404, { error: 'İstifadəçi tapılmadı' });
      await deleteUser(id);
      await applyOps([{ t: 'log', row: { action: 'İstifadəçi', task_label: `${u.name} silindi` } }], me);
      return send(res, 200, { ok: true });
    }
    send(res, 400, { error: 'Naməlum əməliyyat' });
  } catch (e) { fail(res, e); }
}
