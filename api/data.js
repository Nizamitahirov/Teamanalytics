import { readData } from '../lib/firestore.js';
import { requireUser, send, fail } from '../lib/http.js';

// GET /api/data          → tam yükləmə
// GET /api/data?since=TS → yalnız TS-dən sonra dəyişənlər (sürətli, az oxuma)
export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const since = new URL(req.url, 'http://x').searchParams.get('since') || null;
    send(res, 200, { user, ...(await readData(since)) });
  } catch (e) { fail(res, e); }
}
