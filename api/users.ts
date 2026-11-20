import { listUsers, applyOps } from '../server/firestore.js';
import {
  createSession,
  hashPassword,
  loadUser,
  passwordProblem,
  patchUser,
  revokeSessions,
  roleOf,
  sessionCookies,
  userId,
  verifyPassword,
  invalidateUser,
  MIN_PASSWORD,
} from '../server/auth.js';
import { deleteUser } from '../server/firestore.js';
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
import { UsersBodySchema, type Role } from '../shared/schema.js';

const PW_ERRORS = {
  too_short: `Parol ən azı ${MIN_PASSWORD} simvol olmalıdır`,
  common: 'Bu parol çox yayılmışdır və asan təxmin edilir — başqa parol seçin',
  same_as_name: 'Parolda istifadəçi adı olmamalıdır',
} as const;

/**
 * İstifadəçilərin idarəsi (SPEC §2, §6.10, §10). Parollar heş kimi saxlanır, heç vaxt qaytarılmır.
 * - change-own: hər daxil olmuş istifadəçi (cari parol tələb olunur) — məcburi dəyişmə də buradan
 * - qalanları: yalnız admin. Sonuncu aktiv admini silmək / rolunu endirmək qadağandır.
 */
export default async function handler(req: Req, res: Res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    if (req.method === 'GET') {
      if (me.role !== 'admin') return sendError(res, 403, 'forbidden', 'Bu əməliyyat üçün icazəniz yoxdur');
      return send(res, 200, { users: await listUsers(), me: me.name });
    }
    if (req.method !== 'POST') return methodNotAllowed(res, 'GET və ya POST');
    const b = await parseBody(req, res, UsersBodySchema);
    if (!b) return;
    const audit = { ip_hash: await requestIpHash(req) };
    const log = (task_label: string) => applyOps([{ t: 'log', row: { action: 'İstifadəçi', task_label } }], me.name, audit);

    /* ---------- öz parolunu dəyiş ---------- */
    if (b.action === 'change-own') {
      const u = await loadUser(me.id, true);
      if (!u || !(await verifyPassword(u, b.current))) return sendError(res, 400, 'bad_current', 'Cari parol yanlışdır');
      if (b.password === b.current) return sendError(res, 400, 'same_password', 'Yeni parol köhnə ilə eyni ola bilməz');
      const problem = passwordProblem(b.password, me.name);
      if (problem) return sendError(res, 400, `weak_password_${problem}`, PW_ERRORS[problem]);
      const sv = (Number(u.session_version) || 0) + 1;
      await patchUser(me.id, { ...(await hashPassword(b.password)), must_change_password: false, session_version: sv });
      await log(`${me.name} öz parolunu dəyişdi`);
      // Digər cihazlardakı sessiyalar etibarsız olur; bu cihaz üçün yeni sessiya
      const s = await createSession({ ...me, sv });
      return send(res, 200, { ok: true }, { 'Set-Cookie': sessionCookies(s.token, s.maxAge) });
    }

    if (me.role !== 'admin') return sendError(res, 403, 'forbidden', 'Bu əməliyyat üçün icazəniz yoxdur');
    const id = userId(b.name);
    if (!id) return sendError(res, 400, 'invalid_body', 'Ad boş ola bilməz');
    const existing = await loadUser(id, true);
    const users = await listUsers();
    const activeAdmins = users.filter((u) => u.active && u.role === 'admin');
    const isLastAdmin = activeAdmins.length <= 1 && activeAdmins.some((u) => u.id === id);

    if (b.action === 'add' || b.action === 'password') {
      if (b.action === 'add' && existing) return sendError(res, 409, 'exists', 'Bu adda istifadəçi artıq var');
      if (b.action === 'password' && !existing) return sendError(res, 404, 'not_found', 'İstifadəçi tapılmadı');
      const problem = passwordProblem(b.password, b.name);
      if (problem) return sendError(res, 400, `weak_password_${problem}`, PW_ERRORS[problem]);
      const h = await hashPassword(b.password);
      if (b.action === 'add') {
        const role: Role = b.role ?? 'editor';
        // Yeni istifadəçi admin verdiyi parolu ilk girişdə dəyişməlidir
        await patchUser(id, {
          name: b.name,
          ...h,
          active: true,
          created_by: me.name,
          role,
          must_change_password: true,
          session_version: 0,
        });
        await log(`${b.name} əlavə edildi (${role})`);
      } else {
        // Admin başqasının parolunu sıfırlayır → bütün sessiyaları bağlanır, növbəti girişdə dəyişməlidir
        const self = id === me.id;
        await patchUser(id, { ...h, active: true, must_change_password: !self, failed_attempts: 0, locked_until: null });
        if (!self) await revokeSessions(id);
        await log(`${existing!.name} üçün parol dəyişdirildi`);
      }
      return send(res, 200, { ok: true });
    }

    if (!existing) return sendError(res, 404, 'not_found', 'İstifadəçi tapılmadı');
    const name = String(existing.name || id);

    if (b.action === 'role') {
      if (b.role !== 'admin' && isLastAdmin)
        return sendError(res, 400, 'last_admin', 'Sonuncu administratorun rolunu dəyişmək olmaz');
      if (roleOf(existing) === b.role) return send(res, 200, { ok: true });
      await patchUser(id, { role: b.role });
      await log(`${name}: rol ${roleOf(existing)} → ${b.role}`);
      return send(res, 200, { ok: true });
    }
    if (b.action === 'revoke') {
      await revokeSessions(id);
      await log(`${name}: bütün sessiyalar ləğv edildi`);
      return send(res, 200, { ok: true });
    }
    if (b.action === 'unlock') {
      await patchUser(id, { failed_attempts: 0, locked_until: null });
      await log(`${name}: kilid açıldı`);
      return send(res, 200, { ok: true });
    }
    // remove
    if (id === me.id) return sendError(res, 400, 'self_remove', 'Öz istifadəçinizi silə bilməzsiniz');
    if (users.length <= 1) return sendError(res, 400, 'last_user', 'Sonuncu istifadəçini silmək olmaz');
    if (isLastAdmin) return sendError(res, 400, 'last_admin', 'Sonuncu administratoru silmək olmaz');
    await deleteUser(id);
    invalidateUser(id); // sessiyalar dərhal etibarsızdır (istifadəçi yoxdur)
    await log(`${name} silindi`);
    send(res, 200, { ok: true });
  } catch (e) {
    fail(res, e);
  }
}
