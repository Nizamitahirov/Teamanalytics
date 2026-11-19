import { readFullLog } from '../lib/firestore.js';
import { requireUser, send, fail } from '../lib/http.js';

// Bütün jurnal (Excel export üçün)
export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try { send(res, 200, { log: await readFullLog() }); } catch (e) { fail(res, e); }
}
