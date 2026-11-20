// Test köməkçisi: api/*.ts funksiyalarını mock Firestore ilə HTTP serverdə işə salır.
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { startMockFirestore, mockEnv, type MockFirestore } from '../../dev/mock-firestore.js';
import type { Handler } from '../../server/http.js';
import { ApiRequestError } from '../../src/lib/api.js';
import type { Request } from '../../src/store/dataStore.js';

export type TestApi = { base: string; fs: MockFirestore; close: () => Promise<void> };

export async function startApi(): Promise<TestApi> {
  const fs = await startMockFirestore();
  Object.assign(process.env, mockEnv(fs.url));
  const names = ['login', 'logout', 'me', 'data', 'ops', 'log', 'users', 'health', 'scenarios', 'notifications', 'snapshots'];
  const handlers = Object.fromEntries(
    await Promise.all(names.map(async (n) => [n, (await import(`../../api/${n}.ts`)).default as Handler])),
  );
  // Alt qovluqdakı funksiya (Vite dinamik importu bir səviyyəli dəyişən yolu dəstəkləyir)
  handlers['cron/daily'] = (await import('../../api/cron/daily.js')).default as Handler;
  const server = http.createServer((req, res) => {
    const h = handlers[new URL(req.url || '/', 'http://x').pathname.replace('/api/', '')];
    if (!h) {
      res.statusCode = 404;
      return res.end();
    }
    return h(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  return {
    base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    fs,
    close: async () => {
      await new Promise<void>((r) => server.close(() => r()));
      await fs.close();
    },
  };
}

/** Bir "brauzer": öz cookie-si olan request funksiyası. `offline = true` → şəbəkə xətası. */
export async function client(base: string, username = 'Ecosystem', password = 'Ecosystem') {
  let cookie = '';
  const state = { offline: false };
  const request: Request = async (path, init = {}) => {
    if (state.offline) throw new ApiRequestError('network', 0, 'network');
    const res = await fetch(base + path, {
      method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
      headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    if (!res.ok) throw new ApiRequestError(body.error || String(res.status), res.status, body.code || 'http');
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    return body;
  };
  await request('/api/login', { json: { username, password } });
  return { request, state };
}
