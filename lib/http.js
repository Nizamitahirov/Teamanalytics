import { readCookie, verifySession } from './auth.js';

export async function requireUser(req, res) {
  const user = await verifySession(readCookie(req.headers.cookie)).catch(() => null);
  if (!user) { send(res, 401, { error: 'Giriş tələb olunur' }); return null; }
  return user;
}

export function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}

export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function fail(res, e) {
  console.error(e);
  send(res, 500, { error: e.message || String(e) });
}
