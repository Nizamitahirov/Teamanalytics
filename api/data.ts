import { readFile } from 'node:fs/promises';
import { readData, seed } from '../server/firestore.js';
import { requireUser, send, fail, type Req, type Res } from '../server/http.js';

// GET /api/data          → tam yükləmə (baza boşdursa ilkin məlumatlar avtomatik yazılır)
// GET /api/data?since=TS → yalnız TS-dən sonra dəyişənlər
export default async function handler(req: Req, res: Res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const since = new URL(req.url || '/', 'http://x').searchParams.get('since') || null;
    let data = await readData(since);
    if ('full' in data && data.full && !data.ts && !data.tasks.length) {
      const initial = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
      if (await seed(initial, user)) data = await readData(null);
    }
    send(res, 200, { user, ...data });
  } catch (e) {
    fail(res, e);
  }
}
