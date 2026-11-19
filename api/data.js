import { readAll } from '../lib/sheets.js';
import { requireUser, send, fail } from '../lib/http.js';

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const data = await readAll();
    send(res, 200, { user, ...data });
  } catch (e) { fail(res, e); }
}
