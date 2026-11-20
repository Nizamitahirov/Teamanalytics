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
    let data = await readData(since, user.name);
    // Baza boşdursa ilkin data. `ts`-ə baxmırıq: ilk addım parol dəyişməsi olarsa jurnal yazısı meta.updated qoyur
    // (əvvəl bu halda seed heç vaxt olmurdu). seed() özü tasks kolleksiyasını yoxlayır — tombstone varsa yazmır.
    if ('full' in data && data.full && !data.tasks.length && !data.employees.length) {
      const initial = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
      if (await seed(initial, user.name)) data = await readData(null, user.name);
    }
    send(res, 200, { user: user.name, role: user.role, ...data });
  } catch (e) {
    fail(res, e);
  }
}
