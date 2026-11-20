// Ssenarilər + təsdiq axını (SPEC §6.5, §2, Mərhələ 6 QM: "ssenari canlı dataya yazmır").
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startApi, type TestApi } from '../helpers/apiServer.js';

let api: TestApi;
type Body = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- test cavabları

async function call(path: string, cookie = '', json?: unknown): Promise<{ status: number; body: Body }> {
  const res = await fetch(api.base + path, {
    method: json !== undefined ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Body };
}
async function login(username: string, password: string) {
  const res = await fetch(api.base + '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const m = (res.headers.get('set-cookie') ?? '').match(/__Host-wfp_session=([^;]*)/);
  return m ? `__Host-wfp_session=${m[1]}` : '';
}

const c: Record<'admin' | 'editor' | 'editor2' | 'viewer', string> = { admin: '', editor: '', editor2: '', viewer: '' };
let tasks: Body[] = [];
const big = () => tasks.find((t) => !t.is_cancelled && t.hours > 100)!;
const small = () => tasks.find((t) => !t.is_cancelled && t.hours > 0 && t.hours < 10)!;
const owner = (t: Body) => String(t.owner_after || t.owner_before);

const change = (id: string, ops: unknown[]) => ({ id, kind: 'transfer', label: 'Test ötürmə', ops });

beforeAll(async () => {
  api = await startApi();
  c.admin = await login('Ecosystem', 'Ecosystem');
  tasks = (await call('/api/data', c.admin)).body.tasks;
  for (const [name, pw, role] of [
    ['Redaktor', 'Yazar-Sozu-2026-a', 'editor'],
    ['Redaktor İki', 'Yazar-Sozu-2026-b', 'editor'],
    ['Rəhbər', 'Baxis-Sozu-2026-c', 'viewer'],
  ])
    expect((await call('/api/users', c.admin, { action: 'add', name, password: pw, role })).status).toBe(200);
  c.editor = await login('Redaktor', 'Yazar-Sozu-2026-a');
  c.editor2 = await login('Redaktor İki', 'Yazar-Sozu-2026-b');
  c.viewer = await login('Rəhbər', 'Baxis-Sozu-2026-c');
});
afterAll(() => api.close());

describe('ssenari CRUD + RBAC', () => {
  it('viewer oxuya bilir, yarada bilmir', async () => {
    expect((await call('/api/scenarios', c.viewer)).status).toBe(200);
    const r = await call('/api/scenarios', c.viewer, { action: 'create', id: 'S-viewer-1', name: 'X', changes: [] });
    expect(r.status).toBe(403);
  });

  it('ssenari canlı dataya YAZMIR: tapşırıqlar və meta.updated dəyişmir, yalnız scen_ts', async () => {
    const before = await call('/api/data', c.editor);
    const t = big();
    const ops = [
      { t: 'upsert', table: 'Tasks', row: { id: t.id, owner_after: 'Ssenari Adamı' }, base: { owner_after: t.owner_after } },
    ];
    expect(
      (await call('/api/scenarios', c.editor, { action: 'create', id: 'S-test-1', name: 'Sınaq', changes: [change('c1', ops)] }))
        .status,
    ).toBe(200);
    expect(
      (
        await call('/api/scenarios', c.editor, {
          action: 'update',
          id: 'S-test-1',
          name: 'Sınaq 2',
          changes: [change('c1', ops)],
        })
      ).status,
    ).toBe(200);
    // Delta sorğusu "dəyişiklik yoxdur" deməlidir — canlı data toxunulmaz
    const after = await call('/api/data?since=' + encodeURIComponent(before.body.ts), c.editor);
    expect(after.body.unchanged).toBe(true);
    expect(after.body.scen_ts).not.toBe(before.body.scen_ts);
    const full = await call('/api/data', c.editor);
    expect(full.body.tasks.find((x: Body) => x.id === t.id)).toEqual(before.body.tasks.find((x: Body) => x.id === t.id));
    expect(full.body.employees.some((e: Body) => e.name === 'Ssenari Adamı')).toBe(false);
    // Ssenari özü saxlanıb, dəyişikliklər JSON-dan geri oxunur
    const list = (await call('/api/scenarios', c.viewer)).body.scenarios as Body[];
    const s = list.find((x) => x.id === 'S-test-1')!;
    expect(s).toMatchObject({ name: 'Sınaq 2', status: 'draft', created_by: 'Redaktor' });
    expect(s.changes[0].ops[0].row.owner_after).toBe('Ssenari Adamı');
  });

  it('başqa editor dəyişə/silə bilmir, admin bilir', async () => {
    expect((await call('/api/scenarios', c.editor2, { action: 'update', id: 'S-test-1', name: 'Oğurluq' })).status).toBe(403);
    expect((await call('/api/scenarios', c.editor2, { action: 'delete', id: 'S-test-1' })).status).toBe(403);
    expect((await call('/api/scenarios', c.admin, { action: 'update', id: 'S-test-1', description: 'admin qeydi' })).status).toBe(
      200,
    );
  });

  it('yanlış dəyişiklik → 400, eyni id → 409, olmayan → 404', async () => {
    const bad = await call('/api/scenarios', c.editor, {
      action: 'create',
      id: 'S-bad-1',
      name: 'X',
      changes: [{ id: 'c', kind: 'transfer', label: 'x', ops: [{ t: 'log', row: { action: 'x' } }] }],
    });
    expect(bad.status).toBe(400);
    expect((await call('/api/scenarios', c.editor, { action: 'create', id: 'S-test-1', name: 'X', changes: [] })).status).toBe(
      409,
    );
    expect((await call('/api/scenarios', c.editor, { action: 'archive', id: 'S-yoxdur-1' })).status).toBe(404);
  });

  it('arxiv → bərpa, silmə (yumşaq)', async () => {
    await call('/api/scenarios', c.editor, { action: 'create', id: 'S-del-1', name: 'Silinəcək', changes: [] });
    expect((await call('/api/scenarios', c.editor, { action: 'archive', id: 'S-del-1' })).status).toBe(200);
    expect((await call('/api/scenarios', c.editor, { action: 'update', id: 'S-del-1', name: 'x' })).status).toBe(409);
    expect((await call('/api/scenarios', c.editor, { action: 'restore', id: 'S-del-1' })).status).toBe(200);
    expect((await call('/api/scenarios', c.editor, { action: 'delete', id: 'S-del-1' })).status).toBe(200);
    const list = (await call('/api/scenarios', c.editor)).body.scenarios as Body[];
    expect(list.some((x) => x.id === 'S-del-1')).toBe(false);
  });
});

describe('təsdiq axını (requireApproval)', () => {
  const setApproval = (v: number) =>
    call('/api/ops', c.admin, { ops: [{ t: 'upsert', table: 'Settings', row: { key: 'approval', value: v } }] });

  it('söndürülü (default): editor böyük ötürmə edə və ssenari tətbiq edə bilir', async () => {
    const t = small();
    const r = await call('/api/ops', c.editor, {
      ops: [{ t: 'upsert', table: 'Tasks', row: { id: t.id, owner_after: owner(t) } }],
    });
    expect(r.status).toBe(200);
    await call('/api/scenarios', c.editor, { action: 'create', id: 'S-free-1', name: 'Sərbəst', changes: [] });
    expect((await call('/api/scenarios', c.editor, { action: 'applied', id: 'S-free-1' })).status).toBe(200);
    // Tətbiq edilmiş ssenari bir daha tətbiq olunmur
    expect((await call('/api/scenarios', c.editor, { action: 'applied', id: 'S-free-1' })).status).toBe(409);
  });

  it('açıq: editor-un həddi aşan ötürməsi 403, kiçik ötürmə və admin keçir', async () => {
    expect((await setApproval(1)).status).toBe(200);
    const me = await call('/api/me', c.editor);
    expect(me.body.settings).toMatchObject({ approval: 1, approval_hours: 40 });
    const b = big();
    const s = small();
    const bigOp = { ops: [{ t: 'upsert', table: 'Tasks', row: { id: b.id, owner_after: 'Redaktor İki' } }] };
    const r = await call('/api/ops', c.editor, bigOp);
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('approval_required');
    const tasksNow = (await call('/api/data', c.admin)).body.tasks as Body[];
    expect(owner(tasksNow.find((x) => x.id === b.id)!)).toBe(owner(b)); // heç nə yazılmayıb
    expect(
      (
        await call('/api/ops', c.editor, {
          ops: [{ t: 'upsert', table: 'Tasks', row: { id: s.id, owner_after: 'Redaktor İki' } }],
        })
      ).status,
    ).toBe(200);
    // Eyni icraçıya "ötürmə" (dəyişiklik yoxdur) sayılmır
    expect(
      (
        await call('/api/ops', c.editor, {
          ops: [{ t: 'upsert', table: 'Tasks', row: { id: b.id, owner_after: owner(b), hours: b.hours } }],
        })
      ).status,
    ).toBe(200);
    expect((await call('/api/ops', c.admin, bigOp)).status).toBe(200);
  });

  it('editor tətbiq edə bilmir → təsdiqə göndərir → admin bildiriş alır → rədd → yenidən → təsdiq', async () => {
    await call('/api/scenarios', c.editor, { action: 'create', id: 'S-appr-1', name: 'Böyük plan', changes: [] });
    const denied = await call('/api/scenarios', c.editor, { action: 'applied', id: 'S-appr-1' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('approval_required');

    expect((await call('/api/scenarios', c.editor, { action: 'submit', id: 'S-appr-1', comment: 'Baxın' })).body.notified).toBe(
      1,
    );
    const adminView = (await call('/api/scenarios', c.admin)).body;
    expect(adminView.scenarios.find((x: Body) => x.id === 'S-appr-1').status).toBe('pending');
    const n = (adminView.notifications as Body[]).find((x) => x.link === '/scenarios/S-appr-1')!;
    expect(n).toMatchObject({ kind: 'approval_request', read: false, from: 'Redaktor' });
    expect(n.text).toContain('Böyük plan');
    // Başqasının bildirişləri görünmür
    expect(((await call('/api/scenarios', c.editor2)).body.notifications as Body[]).length).toBe(0);
    // Pending redaktə olunmur; editor rədd edə bilmir
    expect((await call('/api/scenarios', c.editor, { action: 'update', id: 'S-appr-1', name: 'x' })).status).toBe(409);
    expect((await call('/api/scenarios', c.editor2, { action: 'reject', id: 'S-appr-1' })).status).toBe(403);

    expect((await call('/api/scenarios', c.admin, { action: 'reject', id: 'S-appr-1', comment: 'Hələ tez' })).status).toBe(200);
    const ed = (await call('/api/scenarios', c.editor)).body;
    expect(ed.scenarios.find((x: Body) => x.id === 'S-appr-1')).toMatchObject({ status: 'draft', review_comment: 'Hələ tez' });
    expect((ed.notifications as Body[])[0]).toMatchObject({ kind: 'rejected' });

    await call('/api/scenarios', c.editor, { action: 'submit', id: 'S-appr-1' });
    expect((await call('/api/scenarios', c.admin, { action: 'applied', id: 'S-appr-1' })).status).toBe(200);
    const ed2 = (await call('/api/scenarios', c.editor)).body;
    expect(ed2.scenarios.find((x: Body) => x.id === 'S-appr-1')).toMatchObject({ status: 'applied', applied_by: 'Ecosystem' });
    expect((ed2.notifications as Body[])[0]).toMatchObject({ kind: 'approved' });
  });

  it('bildirişləri oxunmuş et (yalnız özününkü)', async () => {
    const before = ((await call('/api/scenarios', c.editor)).body.notifications as Body[]).filter((n) => !n.read).length;
    expect(before).toBeGreaterThan(0);
    // Admin editor-un bildirişini işarələyə bilmir (öz siyahısında yoxdur)
    const edIds = ((await call('/api/scenarios', c.editor)).body.notifications as Body[]).map((n) => n.id);
    expect((await call('/api/notifications', c.admin, { ids: edIds })).body.marked).toBe(0);
    expect((await call('/api/notifications', c.editor, { all: true })).body.marked).toBe(before);
    const after = ((await call('/api/notifications', c.editor)).body.notifications as Body[]).filter((n) => !n.read);
    expect(after.length).toBe(0);
    await setApproval(0);
  });
});
