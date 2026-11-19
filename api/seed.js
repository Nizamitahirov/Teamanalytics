import { readFile } from 'node:fs/promises';
import { seed } from '../lib/firestore.js';
import { requireUser, send, fail } from '../lib/http.js';

// Baza boşdursa, ilkin məlumatları (Birbank + Pashapay) yazır.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST gözlənilir' });
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const data = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
    const ok = await seed(data, user);
    if (!ok) return send(res, 409, { error: 'Bazada artıq məlumat var — ilkin məlumatlar yazılmadı' });
    send(res, 200, { ok: true, tasks: data.tasks.length });
  } catch (e) { fail(res, e); }
}
