import { getMeta, getUser, settingsOf } from '../server/firestore.js';
import { userId } from '../server/auth.js';
import { requireUser, send, fail, type Req, type Res } from '../server/http.js';
import { DEFAULT_SETTINGS, RoleSchema, type MeResponse } from '../shared/schema.js';

// GET /api/me → cari istifadəçi, rolu, ayarlar, feature flag-lar (2 oxuma)
// Rol sahəsi hələ yazılmayıbsa (miqrasiyadan əvvəl) mövcud istifadəçilər `admin` sayılır (SPEC §2).
export default async function handler(req: Req, res: Res) {
  const name = await requireUser(req, res);
  if (!name) return;
  try {
    const [u, meta] = await Promise.all([getUser(userId(name)), getMeta()]);
    const role = RoleSchema.safeParse(u?.role);
    const out: MeResponse = {
      user: { name, role: role.success ? role.data : 'admin' },
      settings: { ...DEFAULT_SETTINGS, ...(settingsOf(meta) as Record<string, number>) },
      flags: {},
    };
    send(res, 200, out);
  } catch (e) {
    fail(res, e);
  }
}
