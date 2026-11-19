import { readFile } from 'node:fs/promises';
import { isEmpty, replaceAll, applyOps } from '../lib/sheets.js';
import { requireUser, send, fail } from '../lib/http.js';

// Sheet boşdursa, ilkin məlumatları (Birbank + Pashapay) yazır.
export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST gözlənilir' });
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    if (!(await isEmpty())) return send(res, 409, { error: 'Sheet boş deyil — ilkin məlumatlar yazılmadı' });
    const seed = JSON.parse(await readFile(new URL('../data/seed.json', import.meta.url), 'utf8'));
    await replaceAll(seed, user);
    await applyOps([{ t: 'log', row: { action: 'Import', task_label: `İlkin məlumatlar: ${seed.tasks.length} tapşırıq, ${seed.employees.length} əməkdaş` } }], user);
    send(res, 200, { ok: true, tasks: seed.tasks.length });
  } catch (e) { fail(res, e); }
}
