// Lokal inkişaf serveri: Vercel-i (public/ + /api/*.ts) və Firestore REST API-ni yaddaşda təqlid edir.
// İşə salmaq: npm run dev  →  http://localhost:8765  (v1, giriş: Ecosystem / Ecosystem)
//             npm run dev:v2 → http://localhost:5173  (v2 Vite, /api bu serverə proksi olunur)
// Mock bazanın vəziyyəti: http://localhost:8791  (sənədlər və API çağırışlarının siyahısı, testlər üçün)
// Real Firebase-ə toxunmur; hər işə salınmada baza boşdur və ilkin data avtomatik yazılır.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startMockFirestore, mockEnv } from './mock-firestore.js';
import type { Handler } from '../server/http.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8765);

const fsMock = await startMockFirestore({ port: 8790, latencyMs: 40 });
Object.assign(process.env, mockEnv(fsMock.url));

/* ---------- Vercel emulyasiyası ---------- */
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const handlers = new Map<string, Handler>();
async function loadHandler(name: string): Promise<Handler | null> {
  if (!/^[a-z]+(\/[a-z]+)?$/.test(name)) return null;
  if (!handlers.has(name)) {
    try {
      const mod = await import(pathToFileURL(path.join(ROOT, 'api', `${name}.ts`)).href);
      handlers.set(name, mod.default as Handler);
    } catch {
      return null;
    }
  }
  return handlers.get(name) ?? null;
}

http
  .createServer(async (req, res) => {
    const u = new URL(req.url || '/', `http://localhost:${PORT}`);
    if (u.pathname.startsWith('/api/')) {
      const h = await loadHandler(u.pathname.slice(5));
      if (!h) {
        res.statusCode = 404;
        return res.end('{"error":"Tapılmadı","code":"not_found"}');
      }
      return h(req, res);
    }
    const f = path.join(ROOT, 'public', path.normalize(u.pathname === '/' ? 'index.html' : u.pathname));
    if (!f.startsWith(path.join(ROOT, 'public'))) {
      res.statusCode = 403;
      return res.end('403');
    }
    try {
      const b = await readFile(f);
      res.setHeader('Content-Type', types[path.extname(f)] || 'application/octet-stream');
      res.end(b);
    } catch {
      res.statusCode = 404;
      res.end('404');
    }
  })
  .listen(PORT, () => console.log(`dev ready → http://localhost:${PORT}`));

// 8791: mock bazanın görüntüsü (GET) və sıfırlama (POST /reset — e2e testləri təmiz baza ilə başlamaq üçün)
http
  .createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST' && req.url === '/reset') {
      fsMock.reset();
      return res.end('{"ok":true}');
    }
    res.end(JSON.stringify({ calls: fsMock.calls, docs: fsMock.dump() }));
  })
  .listen(8791);
