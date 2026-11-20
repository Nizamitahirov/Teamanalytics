// Təhlükəsizlik (SPEC §2, §10, Mərhələ 5 QM): RBAC matrisi, kilid, sessiya versiyası, parol siyasəti, CSRF, audit.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type TestApi } from '../helpers/apiServer.js';
import { passwordProblem, LOCK_AFTER } from '../../server/auth.js';
import { _resetRate } from '../../server/http.js';

let api: TestApi;
type R = { status: number; body: Record<string, unknown>; cookie: string; setCookie: string };

async function call(
  path: string,
  cookie = '',
  init: { json?: unknown; method?: string; headers?: Record<string, string> } = {},
): Promise<R> {
  const res = await fetch(api.base + path, {
    method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const m = setCookie.match(/__Host-wfp_session=([^;]*)/);
  return {
    status: res.status,
    body: (await res.json().catch(() => ({}))) as Record<string, unknown>,
    cookie: m && m[1] ? `__Host-wfp_session=${m[1]}` : '',
    setCookie,
  };
}
const login = async (username: string, password: string, remember = false) =>
  call('/api/login', '', { json: { username, password, remember } });

const PW = { admin: 'Ecosystem', editor: 'Gizli-Yazar-Sozu-1', viewer: 'Baxis-Sozu-2026' };
const cookies: Record<string, string> = {};

beforeAll(async () => {
  api = await startApi();
  cookies.admin = (await login('Ecosystem', PW.admin)).cookie;
  await call('/api/data', cookies.admin); // seed
  expect(
    (await call('/api/users', cookies.admin, { json: { action: 'add', name: 'Redaktor', password: PW.editor, role: 'editor' } }))
      .status,
  ).toBe(200);
  expect(
    (await call('/api/users', cookies.admin, { json: { action: 'add', name: 'Rəhbər', password: PW.viewer, role: 'viewer' } }))
      .status,
  ).toBe(200);
  cookies.editor = (await login('Redaktor', PW.editor)).cookie;
  cookies.viewer = (await login('Rəhbər', PW.viewer)).cookie;
});
afterAll(() => api.close());

const logOp = { ops: [{ t: 'log', row: { id: 'L-sec', action: 'Test', task_label: 'x' } }] };

describe('RBAC matrisi (server)', () => {
  const cases: [string, string, { json?: unknown }, Record<'admin' | 'editor' | 'viewer', number>][] = [
    ['GET /api/data', '/api/data', {}, { admin: 200, editor: 200, viewer: 200 }],
    ['GET /api/me', '/api/me', {}, { admin: 200, editor: 200, viewer: 200 }],
    ['GET /api/log', '/api/log', {}, { admin: 200, editor: 200, viewer: 200 }],
    ['POST /api/ops', '/api/ops', { json: logOp }, { admin: 200, editor: 200, viewer: 403 }],
    ['GET /api/users', '/api/users', {}, { admin: 200, editor: 403, viewer: 403 }],
    [
      'POST /api/users revoke',
      '/api/users',
      { json: { action: 'revoke', name: 'Nobody' } },
      { admin: 404, editor: 403, viewer: 403 },
    ],
    [
      'POST /api/users add',
      '/api/users',
      { json: { action: 'add', name: 'X', password: 'Cox-Gizli-Soz-77' } },
      { admin: 200, editor: 403, viewer: 403 },
    ],
    // Mərhələ 6: ssenarilər (viewer oxuyur), rədd etmək yalnız admin, bildirişlər hər kəs (yalnız öz)
    ['GET /api/scenarios', '/api/scenarios', {}, { admin: 200, editor: 200, viewer: 200 }],
    [
      'POST /api/scenarios reject',
      '/api/scenarios',
      { json: { action: 'reject', id: 'S-yoxdur-1' } },
      { admin: 404, editor: 403, viewer: 403 },
    ],
    [
      'POST /api/scenarios archive',
      '/api/scenarios',
      { json: { action: 'archive', id: 'S-yoxdur-1' } },
      { admin: 404, editor: 404, viewer: 403 },
    ],
    ['POST /api/notifications', '/api/notifications', { json: { action: 'read-all' } }, { admin: 200, editor: 200, viewer: 200 }],
  ];
  for (const [label, path, init, expected] of cases)
    for (const role of ['admin', 'editor', 'viewer'] as const)
      it(`${label} — ${role} → ${expected[role]}`, async () => {
        const r = await call(path, cookies[role], init);
        expect(r.status).toBe(expected[role]);
        if (r.status === 403) expect(r.body.code).toBe('forbidden');
      });

  it('sessiyasız → 401', async () => {
    expect((await call('/api/data')).status).toBe(401);
    expect((await call('/api/ops', '', { json: logOp })).status).toBe(401);
  });

  it('/api/me rolu qaytarır; yeni istifadəçi parolu dəyişməlidir', async () => {
    const r = await call('/api/me', cookies.viewer);
    expect(r.body.user).toEqual({ name: 'Rəhbər', role: 'viewer' });
    expect(r.body.mustChange).toBe(true);
  });
});

describe('parol', () => {
  it('siyasət: ≥ 10 simvol, yayılmış parollar, ad', () => {
    expect(passwordProblem('Qisa-1')).toBe('too_short');
    expect(passwordProblem('1234567890')).toBe('common');
    expect(passwordProblem('qwertyuiop')).toBe('common');
    expect(passwordProblem('aaaaaaaaaaaa')).toBe('common');
    expect(passwordProblem('Ecosystem1')).toBe('common');
    expect(passwordProblem('nizami-2026-xyz', 'Nizami')).toBe('same_as_name');
    expect(passwordProblem('Yasil-Alma-Agaci-7')).toBeNull();
    expect(passwordProblem('Cox-Gizli-Soz-77', 'X')).toBeNull(); // 1–2 hərfli ad qaydanı işə salmır
  });

  it('öz parolunu dəyiş: cari parol yoxlanır; uğurda yeni cookie, digər sessiyalar bağlanır', async () => {
    const other = (await login('Redaktor', PW.editor)).cookie; // "ikinci cihaz"
    expect(
      (
        await call('/api/users', cookies.editor, {
          json: { action: 'change-own', current: 'yanlış', password: 'Yeni-Yazar-Sozu-3' },
        })
      ).body.code,
    ).toBe('bad_current');
    expect(
      (await call('/api/users', cookies.editor, { json: { action: 'change-own', current: PW.editor, password: '1234567890' } }))
        .body.code,
    ).toMatch(/^weak_password/);
    const r = await call('/api/users', cookies.editor, {
      json: { action: 'change-own', current: PW.editor, password: 'Yeni-Yazar-Sozu-3' },
    });
    expect(r.status).toBe(200);
    expect(r.cookie).toBeTruthy();
    PW.editor = 'Yeni-Yazar-Sozu-3';
    cookies.editor = r.cookie;
    expect((await call('/api/me', r.cookie)).body.mustChange).toBe(false);
    expect((await call('/api/me', other)).status).toBe(401);
  });

  it('ilkin Ecosystem/Ecosystem parolu → mustChange; dəyişəndən sonra yox', async () => {
    expect((await call('/api/me', cookies.admin)).body.mustChange).toBe(true);
    const r = await call('/api/users', cookies.admin, {
      json: { action: 'change-own', current: 'Ecosystem', password: 'Admin-Yeni-Sozu-42' },
    });
    expect(r.status).toBe(200);
    cookies.admin = r.cookie;
    PW.admin = 'Admin-Yeni-Sozu-42';
    expect((await call('/api/me', cookies.admin)).body.mustChange).toBe(false);
  });

  it('admin parolu sıfırlayır → istifadəçinin sessiyaları bağlanır, yenidən dəyişməlidir', async () => {
    expect(
      (await call('/api/users', cookies.admin, { json: { action: 'password', name: 'Redaktor', password: 'Sifirlanmis-Soz-5' } }))
        .status,
    ).toBe(200);
    expect((await call('/api/me', cookies.editor)).status).toBe(401);
    const r = await login('Redaktor', 'Sifirlanmis-Soz-5');
    expect(r.body.mustChange).toBe(true);
    cookies.editor = r.cookie;
  });
});

describe('kilid (Firestore-da)', () => {
  it(`${LOCK_AFTER} yanlış cəhd → 423 vaxtla; düzgün parol da kilidlidir; admin kilidi açır`, async () => {
    for (let i = 1; i < LOCK_AFTER; i++) expect((await login('Rəhbər', 'yanlış')).status).toBe(401);
    const locked = await login('Rəhbər', 'yanlış');
    expect(locked.status).toBe(423);
    expect(locked.body.code).toBe('locked');
    expect(Date.parse(String(locked.body.until))).toBeGreaterThan(Date.now() + 14 * 60e3);
    expect((await login('Rəhbər', PW.viewer)).status).toBe(423);
    expect(api.fs.dump()['users/rəhbər'].locked_until).toBeTruthy();
    const list = (await call('/api/users', cookies.admin)).body.users as { name: string; locked_until: string | null }[];
    expect(list.find((u) => u.name === 'Rəhbər')?.locked_until).toBeTruthy();
    expect((await call('/api/users', cookies.admin, { json: { action: 'unlock', name: 'Rəhbər' } })).status).toBe(200);
    expect((await login('Rəhbər', PW.viewer)).status).toBe(200);
  });

  it('yanlış ad və yanlış parol eyni cavabı verir', async () => {
    const a = await login('mövcud-olmayan', 'x');
    const b = await login('Rəhbər', 'x');
    expect(a.body).toEqual(b.body);
    expect(a.body).toEqual({ error: 'Ad və ya parol yanlışdır', code: 'bad_credentials' });
  });
});

describe('sessiya', () => {
  it('"Məni xatırla" → 7 gün, əks halda 12 saat', async () => {
    expect((await login('Rəhbər', PW.viewer, true)).setCookie).toMatch(/Max-Age=604800/);
    expect((await login('Rəhbər', PW.viewer)).setCookie).toMatch(/Max-Age=43200/);
  });
  it('cookie __Host- prefiksi ilə; köhnə wfp_session adı da qəbul olunur və çıxışda silinir', async () => {
    const r = await login('Rəhbər', PW.viewer);
    expect(r.setCookie).toMatch(/__Host-wfp_session=[^;]+; Path=\/; HttpOnly; Secure; SameSite=Lax/);
    expect(r.setCookie).toMatch(/wfp_session=; Path=\/;.*Max-Age=0/);
    const legacy = r.cookie.replace('__Host-wfp_session', 'wfp_session');
    expect((await call('/api/me', legacy)).status).toBe(200);
    expect((await call('/api/logout', r.cookie, { json: {} })).setCookie).toMatch(/__Host-wfp_session=; .*Max-Age=0/);
  });
  it('"sessiyaları ləğv et" → dərhal 401', async () => {
    const c = (await login('Rəhbər', PW.viewer)).cookie;
    expect((await call('/api/me', c)).status).toBe(200);
    await call('/api/users', cookies.admin, { json: { action: 'revoke', name: 'Rəhbər' } });
    expect((await call('/api/me', c)).status).toBe(401);
  });
  it('istifadəçi silinəndə sessiya dərhal etibarsızdır', async () => {
    await call('/api/users', cookies.admin, { json: { action: 'add', name: 'Müvəqqəti', password: 'Muveqqeti-Soz-88' } });
    const c = (await login('Müvəqqəti', 'Muveqqeti-Soz-88')).cookie;
    expect((await call('/api/me', c)).status).toBe(200);
    await call('/api/users', cookies.admin, { json: { action: 'remove', name: 'Müvəqqəti' } });
    expect((await call('/api/me', c)).status).toBe(401);
  });
  it('rol dəyişikliyi tətbiq olunur (viewer → editor yaza bilir)', async () => {
    const c = (await login('Rəhbər', PW.viewer)).cookie;
    expect((await call('/api/ops', c, { json: logOp })).status).toBe(403);
    await call('/api/users', cookies.admin, { json: { action: 'role', name: 'Rəhbər', role: 'editor' } });
    expect((await call('/api/ops', c, { json: logOp })).status).toBe(200);
    await call('/api/users', cookies.admin, { json: { action: 'role', name: 'Rəhbər', role: 'viewer' } });
  });
});

describe('admin qoruması', () => {
  it('sonuncu admin rolunu endirə və silə bilməz', async () => {
    expect(
      (await call('/api/users', cookies.admin, { json: { action: 'role', name: 'Ecosystem', role: 'editor' } })).body.code,
    ).toBe('last_admin');
    expect((await call('/api/users', cookies.admin, { json: { action: 'remove', name: 'Ecosystem' } })).body.code).toBe(
      'self_remove',
    );
    // ikinci admin varsa birinci endirilə bilər
    await call('/api/users', cookies.admin, { json: { action: 'role', name: 'Redaktor', role: 'admin' } });
    expect((await call('/api/users', cookies.admin, { json: { action: 'role', name: 'Redaktor', role: 'editor' } })).status).toBe(
      200,
    );
  });
});

describe('CSRF, audit, limit', () => {
  it('başqa saytdan POST → 403 csrf; eyni sayt → 200', async () => {
    const evil = await call('/api/ops', cookies.admin, { json: logOp, headers: { Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    expect(evil.body.code).toBe('csrf');
    expect((await call('/api/ops', cookies.admin, { json: logOp, headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(
      403,
    );
    expect(
      (await call('/api/login', '', { json: { username: 'x', password: 'y' }, headers: { 'Sec-Fetch-Site': 'cross-site' } }))
        .status,
    ).toBe(403);
    const host = new URL(api.base).host;
    expect(
      (
        await call('/api/ops', cookies.admin, {
          json: logOp,
          headers: { Origin: `http://${host}`, 'Sec-Fetch-Site': 'same-origin' },
        })
      ).status,
    ).toBe(200);
  });
  it('jurnal qeydlərində ip_hash var (IP-nin özü yox)', async () => {
    const l = api.fs.dump()['log/L-sec'];
    expect(String(l.ip_hash)).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(l)).not.toMatch(/127\.0\.0\.1/);
  });
  it('istifadəçi başına 300 sorğu/dəq → 429', async () => {
    _resetRate();
    let last = 0;
    for (let i = 0; i < 301; i++) last = (await call('/api/me', cookies.admin)).status;
    expect(last).toBe(429);
    _resetRate();
  });
});
