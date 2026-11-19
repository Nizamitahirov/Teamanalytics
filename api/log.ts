import { readFullLog } from '../server/firestore.js';
import { requireUser, send, fail, type Req, type Res } from '../server/http.js';

// Bütün jurnal (Excel export üçün). Səhifələmə — sonrakı mərhələlər (SPEC §6.9).
export default async function handler(req: Req, res: Res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    send(res, 200, { log: await readFullLog() });
  } catch (e) {
    fail(res, e);
  }
}
