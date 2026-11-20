import { getMeta, settingsOf } from '../server/firestore.js';
import { requireUser, send, fail, type Req, type Res } from '../server/http.js';
import { DEFAULT_SETTINGS, type MeResponse } from '../shared/schema.js';

// GET /api/me → cari istifadəçi, rolu, məcburi parol dəyişməsi, ayarlar, feature flag-lar (1 oxuma + istifadəçi keşi)
// Rol sahəsi hələ yazılmayıbsa (miqrasiyadan əvvəl) mövcud istifadəçilər `admin` sayılır (SPEC §2).
export default async function handler(req: Req, res: Res) {
  const me = await requireUser(req, res);
  if (!me) return;
  try {
    const meta = await getMeta();
    const out: MeResponse = {
      user: { name: me.name, role: me.role },
      mustChange: me.mustChange,
      settings: { ...DEFAULT_SETTINGS, ...(settingsOf(meta) as Record<string, number>) },
      flags: {},
    };
    send(res, 200, out);
  } catch (e) {
    fail(res, e);
  }
}
