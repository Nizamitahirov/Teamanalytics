// Lokal inkişaf serveri: Vercel-i (public/ + /api) və Firestore REST API-ni yaddaşda təqlid edir.
// İşə salmaq: npm run dev  →  http://localhost:8765  (giriş: Ecosystem / Ecosystem)
// Mock bazanın vəziyyəti: http://localhost:8791  (sənədlər və API çağırışlarının siyahısı, testlər üçün)
// Real Firebase-ə toxunmur; hər işə salınmada baza boşdur və ilkin data avtomatik yazılır.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ project_id: 'demo', client_email: 'x@demo', private_key: '-----BEGIN PRIVATE KEY-----\nAA\n-----END PRIVATE KEY-----\n' });
process.env.FIRESTORE_FAKE_TOKEN = 'fake';
process.env.FIRESTORE_API_BASE = 'http://localhost:8790/v1';

/* ---------- mock Firestore REST ---------- */
const ROOTP = '/v1/projects/demo/databases/(default)/documents';
const docs = new Map(); // full name -> fields
const calls = [];
let tick = 0;
const nowTs = () => { const d = new Date(); const us = String((d.getMilliseconds() * 1000 + (tick++ % 1000))).padStart(6, '0'); return d.toISOString().slice(0, 19) + '.' + us + 'Z'; };
const short = (n) => n.split('/documents/')[1];
const val = (v) => v && ('timestampValue' in v ? v.timestampValue : null);
const mock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  let body = ''; for await (const c of req) body += c;
  const j = body ? JSON.parse(body) : {};
  const p = decodeURIComponent(u.pathname);
  calls.push(req.method + ' ' + p.replace(ROOTP, ''));
  const out = (o, st = 200) => { res.statusCode = st; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
  await new Promise(r => setTimeout(r, 40));
  const docOut = (name) => ({ name, fields: docs.get(name) });
  if (p === ROOTP + ':commit') {
    const ts = nowTs();
    for (const w of j.writes) {
      if (w.delete) { docs.delete(w.delete); continue; }
      const name = w.update.name;
      let fields = w.updateMask ? { ...(docs.get(name) || {}) } : {};
      if (w.updateMask) w.updateMask.fieldPaths.forEach(f => { fields[f] = w.update.fields[f]; });
      else fields = { ...w.update.fields };
      (w.updateTransforms || []).forEach(t => { fields[t.fieldPath] = { timestampValue: ts }; });
      docs.set('projects/demo/databases/(default)/documents/' + short(name), fields);
    }
    return out({ commitTime: ts, writeResults: j.writes.map(() => ({})) });
  }
  if (p === ROOTP + ':runQuery') {
    const q = j.structuredQuery; const coll = q.from[0].collectionId;
    let list = [...docs.keys()].filter(n => short(n).split('/')[0] === coll).map(docOut);
    if (q.where) { const since = q.where.fieldFilter.value.timestampValue; list = list.filter(d => val(d.fields._ts) > since); }
    if (q.orderBy) { const desc = q.orderBy[0].direction === 'DESCENDING'; list.sort((a, b) => (val(a.fields._ts) < val(b.fields._ts) ? -1 : 1) * (desc ? -1 : 1)); }
    if (q.limit) list = list.slice(0, q.limit);
    return out(list.length ? list.map(document => ({ document, readTime: nowTs() })) : [{ readTime: nowTs() }]);
  }
  if (req.method === 'GET' && p.startsWith(ROOTP + '/')) {
    const rest = p.slice(ROOTP.length + 1).split('/');
    if (rest.length === 2) { const n = 'projects/demo/databases/(default)/documents/' + rest.join('/'); return docs.has(n) ? out(docOut(n)) : out({ error: { message: 'not found' } }, 404); }
    let list = [...docs.keys()].filter(n => short(n).split('/')[0] === rest[0]).map(docOut);
    const ps = Number(u.searchParams.get('pageSize') || 1000); list = list.slice(0, ps);
    return out(list.length ? { documents: list } : {});
  }
  out({ error: { message: 'not mocked ' + p } }, 404);
});
mock.listen(8790);

/* ---------- Vercel emulation ---------- */
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost:8765');
  if (u.pathname.startsWith('/api/')) {
    const mod = await import(ROOT + u.pathname + '.js');
    return mod.default(req, res);
  }
  const f = path.join(ROOT, 'public', u.pathname === '/' ? 'index.html' : u.pathname);
  try { const b = await readFile(f); res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream'); res.end(b); }
  catch { res.statusCode = 404; res.end('404'); }
}).listen(8765, () => console.log('dev ready'));
http.createServer((req, res) => { res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ calls, docs: Object.fromEntries([...docs].map(([k, f]) => [short(k), Object.fromEntries(Object.entries(f).map(([a, b]) => [a, Object.values(b)[0]]))])) })); }).listen(8791);
