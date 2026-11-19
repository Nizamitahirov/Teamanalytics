import { readFile } from 'node:fs/promises';
import { readData, seed } from '../lib/firestore.js';
import { requireUser, send, fail } from '../lib/http.js';

// GET /api/data          → tam yükləmə (baza boşdursa ilkin məlumatlar avtomatik yazılır)
// GET /api/data?since=TS → yalnız TS-dən sonra dəyişənlər
export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const since = new URL(req.url, 'http://x').searchParams.get('since') || null;
    let data = await readData(since);
    if (data.full && !data.ts && !data.tasks.length) {
      const initial = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
      if (await seed(initial, user)) data = await readData(null);
    }
    send(res, 200, { user, ...data });
  } catch (e) { fail(res, e); }
}
