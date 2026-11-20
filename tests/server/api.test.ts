// Server testləri: API funksiyaları mock Firestore ilə (dev/mock-firestore.ts).
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { startMockFirestore, mockEnv, type MockFirestore } from '../../dev/mock-firestore.js';
import type { Handler } from '../../server/http.js';

let fsMock: MockFirestore;
let base: string;
let server: http.Server;
let cookie = '';

beforeAll(async () => {
  fsMock = await startMockFirestore();
  Object.assign(process.env, mockEnv(fsMock.url));
  delete process.env.AUTH_SECRET;
  const names = ['login', 'logout', 'me', 'data', 'ops', 'log', 'users', 'health', 'scenarios', 'notifications'];
  const handlers = Object.fromEntries(
    await Promise.all(names.map(async (n) => [n, (await import(`../../api/${n}.ts`)).default as Handler])),
  );
  server = http.createServer((req, res) => {
    const name = new URL(req.url || '/', 'http://x').pathname.replace('/api/', '');
    const h = handlers[name];
    if (!h) {
      res.statusCode = 404;
      return res.end();
    }
    return h(req, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await fsMock.close();
});

const api = async (path: string, init: RequestInit & { json?: unknown } = {}) => {
  const res = await fetch(base + path, {
    ...init,
    method: init.method || (init.json !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, headers: res.headers };
};
const login = async (username = 'Ecosystem', password = 'Ecosystem') => {
  const r = await api('/api/login', { json: { username, password } });
  const sc = r.headers.get('set-cookie');
  if (sc) cookie = sc.split(';')[0];
  return r;
};
const doc = (path: string) => fsMock.dump()[path];

describe('giriş', () => {
  beforeEach(() => {
    cookie = '';
  });

  it('auth olmadan /api/data → 401 {error, code}', async () => {
    const r = await api('/api/data');
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'Giriş tələb olunur', code: 'unauthorized' });
  });

  it('yanlış parol ümumi mesaj qaytarır', async () => {
    const r = await login('Ecosystem', 'yanlış');
    expect(r.status).toBe(401);
    expect(r.body.code).toBe('bad_credentials');
    expect(r.body.error).toBe('Ad və ya parol yanlışdır');
  });

  it('boş gövdə → 400 (Zod)', async () => {
    const r = await api('/api/login', { json: { username: '' } });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_body');
  });

  it('ilk giriş Ecosystem istifadəçisini yaradır, cookie qaytarır', async () => {
    const r = await login();
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, user: 'Ecosystem', role: 'admin', mustChange: true });
    expect(cookie).toMatch(/^__Host-wfp_session=/);
    expect(r.headers.get('set-cookie')).toMatch(/HttpOnly; Secure; SameSite=Lax/);
    expect(doc('users/ecosystem')).toMatchObject({ name: 'Ecosystem', active: true, created_by: 'system' });
  });

  it('/api/me rol (default admin) və ayarları qaytarır', async () => {
    await login();
    const r = await api('/api/me');
    expect(r.status).toBe(200);
    expect(r.body.user).toEqual({ name: 'Ecosystem', role: 'admin' });
    expect(r.body.settings).toEqual({ norm: 1922, warn: 85, approval: 0, approval_hours: 40, vacation_days: 30 });
  });
});

describe('data + ops', () => {
  beforeAll(async () => {
    cookie = '';
    await login();
  });

  it('boş baza ilk /api/data-da seed olunur (341/23)', async () => {
    const r = await api('/api/data');
    expect(r.status).toBe(200);
    expect(r.body.full).toBe(true);
    expect(r.body.tasks).toHaveLength(341);
    expect(r.body.employees).toHaveLength(23);
    expect(r.body.ts).toBeTruthy();
  });

  it('dəyişiklik yoxdursa ?since → unchanged', async () => {
    const { body } = await api('/api/data');
    const r = await api(`/api/data?since=${encodeURIComponent(body.ts)}`);
    expect(r.body.unchanged).toBe(true);
  });

  it('upsert yalnız göndərilən sahələri yazır — v2 sahələri qorunur (SPEC §15.3)', async () => {
    // Firestore-da v1 klientinin bilmədiyi sahə (məs. v2 `priority`) var
    const key = 'projects/demo/databases/(default)/documents/tasks/B-25';
    fsMock.docs.set(key, { ...fsMock.docs.get(key), priority: { stringValue: 'high' } });
    const before = (await api('/api/data')).body;
    const t = before.tasks.find((x: { id: string }) => x.id === 'B-25');
    // v1 klientinin göndərdiyi kimi: TASK_FIELDS tam sətir
    const row = { ...t, owner_after: 'Zümrüd' };
    delete row.updated_by;
    delete row.priority;
    delete row._v; // v1 klienti _v göndərmir (normalizeTask yalnız öz sahələrini saxlayır)
    const r = await api('/api/ops', { json: { ops: [{ t: 'upsert', table: 'Tasks', row }] } });
    expect(r.status).toBe(200);
    const after = doc('tasks/B-25');
    expect(after.owner_after).toBe('Zümrüd');
    expect(after.priority).toBe('high');
    expect(after.updated_by).toBe('Ecosystem');
    expect(after._deleted).toBe(false);
  });

  it('delta yalnız dəyişən sənədləri qaytarır', async () => {
    const { body } = await api('/api/data');
    const row = { ...body.tasks.find((x: { id: string }) => x.id === 'B-1'), hours: 13 };
    delete row._v;
    await api('/api/ops', { json: { ops: [{ t: 'upsert', table: 'Tasks', row }] } });
    const d = await api(`/api/data?since=${encodeURIComponent(body.ts)}`);
    expect(d.body.delta).toBe(true);
    expect(d.body.tasks.map((x: { id: string }) => x.id)).toEqual(['B-1']);
  });

  it('delete yumşaqdır (tombstone), tam yükləmədə görünmür', async () => {
    const r = await api('/api/ops', { json: { ops: [{ t: 'delete', table: 'Tasks', key: 'B-2' }] } });
    expect(r.status).toBe(200);
    expect(doc('tasks/B-2')._deleted).toBe(true);
    expect(doc('tasks/B-2').task).toBeTruthy(); // sahələr itmir
    const full = await api('/api/data');
    expect(full.body.tasks.some((x: { id: string }) => x.id === 'B-2')).toBe(false);
  });

  it('Settings və log op-ları', async () => {
    const r = await api('/api/ops', {
      json: {
        ops: [
          { t: 'upsert', table: 'Settings', row: { key: 'warn', value: 90 } },
          { t: 'log', row: { id: 'L-test', ts: '2026-11-19T10:00:00.000Z', action: 'Ayarlar', task_label: 'x' } },
        ],
      },
    });
    expect(r.status).toBe(200);
    expect(Number(doc('meta/main').warn)).toBe(90);
    expect(doc('log/L-test')).toMatchObject({ action: 'Ayarlar', user: 'Ecosystem' });
    expect((await api('/api/me')).body.settings.warn).toBe(90);
  });

  it.each([
    ['naməlum cədvəl', { t: 'upsert', table: 'Foo', row: { id: 'x' } }],
    ['id-siz tapşırıq', { t: 'upsert', table: 'Tasks', row: { task: 'x' } }],
    ['"/" olan açar', { t: 'delete', table: 'Tasks', key: 'a/b' }],
    ['sistem sahəsi', { t: 'upsert', table: 'Tasks', row: { id: 'B-1', _deleted: true } }],
    ['çox uzun mətn', { t: 'upsert', table: 'Tasks', row: { id: 'B-1', task: 'x'.repeat(2001) } }],
    ['obyekt dəyər', { t: 'upsert', table: 'Tasks', row: { id: 'B-1', task: { a: 1 } } }],
  ])('yanlış op → 400 və heç nə yazılmır: %s', async (_name, op) => {
    const writesBefore = fsMock.calls.filter((c) => c.endsWith(':commit')).length;
    const r = await api('/api/ops', { json: { ops: [op] } });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('invalid_body');
    expect(fsMock.calls.filter((c) => c.endsWith(':commit')).length).toBe(writesBefore);
  });

  it('3000-dən çox op → 400', async () => {
    const ops = Array.from({ length: 3001 }, (_, i) => ({ t: 'delete', table: 'Tasks', key: `X-${i}` }));
    expect((await api('/api/ops', { json: { ops } })).status).toBe(400);
  });

  it('GET /api/ops → 405', async () => {
    const r = await api('/api/ops');
    expect(r.status).toBe(405);
    expect(r.body.code).toBe('method_not_allowed');
  });
});

describe('istifadəçilər', () => {
  beforeAll(async () => {
    cookie = '';
    await login();
  });

  it('əlavə et → giriş → parol dəyiş → sil', async () => {
    expect((await api('/api/users', { json: { action: 'add', name: 'Test', password: '123' } })).body.code).toBe(
      'weak_password_too_short',
    );
    expect((await api('/api/users', { json: { action: 'add', name: 'Test', password: 'Gizli-Soz-2026!' } })).status).toBe(200);
    expect((await api('/api/users', { json: { action: 'add', name: 'test', password: 'Gizli-Soz-2026!' } })).status).toBe(409);
    // rol kimi əlavə sahə parol dəyişəndə qorunmalıdır
    const key = 'projects/demo/databases/(default)/documents/users/test';
    fsMock.docs.set(key, { ...fsMock.docs.get(key), role: { stringValue: 'viewer' } });
    expect((await api('/api/users', { json: { action: 'password', name: 'Test', password: 'Yeni-Gizli-Soz-7' } })).status).toBe(
      200,
    );
    expect(doc('users/test').role).toBe('viewer');
    const list = await api('/api/users');
    expect(list.body.users.map((u: { id: string }) => u.id).sort()).toEqual(['ecosystem', 'test']);
    expect(JSON.stringify(list.body)).not.toMatch(/hash|salt/);
    expect((await api('/api/users', { json: { action: 'remove', name: 'Ecosystem' } })).body.code).toBe('self_remove');
    expect((await api('/api/users', { json: { action: 'remove', name: 'Test' } })).status).toBe(200);
    expect(doc('users/test')).toBeUndefined();
  });

  it('naməlum əməliyyat → 400', async () => {
    expect((await api('/api/users', { json: { action: 'drop', name: 'x' } })).status).toBe(400);
  });
});

describe('health', () => {
  it('versiya və service account adı, sirr yoxdur', async () => {
    const r = await api('/api/health');
    expect(r.status).toBe(200);
    expect(r.body.version).toMatch(/^2\./);
    expect(r.body.service_account).toMatch(/layihə: demo/);
    expect(JSON.stringify(r.body)).not.toMatch(/PRIVATE KEY/);
  });
});
