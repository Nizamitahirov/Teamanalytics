// Ssenarilər + təsdiq axını + bildirişlər (SPEC §2, §6.5, Mərhələ 6 QM):
// ssenari canlı dataya yazmır; tətbiq sonrası rəqəmlər ssenaridəki ilə eynidir; tək addımla geri alınır.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataStore, type DataStore } from '../../src/store/dataStore.js';
import { memoryPersist } from '../../src/store/persist.js';
import { createScenarioActions, type ScenarioActions } from '../../src/store/scenarioActions.js';
import { computeMetrics } from '../../shared/metrics.js';
import { cancelIn, makeChange, normIn, rebalanceIn, scenarioImpact, scenarioState, transferIn } from '../../shared/scenario.js';
import { rebalance } from '../../shared/rebalance.js';
import { curOwner } from '../../shared/model.js';
import type { Request } from '../../src/store/dataStore.js';
import { client, startApi, type TestApi } from '../helpers/apiServer.js';

let api: TestApi;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function idle(s: DataStore) {
  for (let i = 0; i < 400; i++) {
    const st = s.getState();
    if (!st.sending && !st.queue.length) return;
    await sleep(5);
  }
  throw new Error('store idle olmadı');
}
/** Canlı data sənədləri (tasks/employees/meta-dan başqa) — ssenari əməliyyatları bunlara toxunmamalıdır */
const liveDocs = () =>
  JSON.stringify(Object.entries(api.fs.dump()).filter(([k]) => k.startsWith('tasks/') || k.startsWith('employees/')));

type User = { store: DataStore; sc: ScenarioActions; request: Request };
async function user(name = 'Ecosystem', password = 'Ecosystem'): Promise<User> {
  const c = await client(api.base, name, password);
  const store = createDataStore({ request: c.request, persist: memoryPersist(), retryDelayMs: 0 });
  await store.getState().pull();
  return { store, sc: createScenarioActions(store, c.request), request: c.request };
}

let admin: User;
let editor: User;
let viewer: User;

beforeAll(async () => {
  api = await startApi();
  admin = await user();
  const pw = 'Gizli-Soz-2026!';
  await admin.request('/api/users', { json: { action: 'add', name: 'Redaktor', password: pw, role: 'editor' } });
  await admin.request('/api/users', { json: { action: 'add', name: 'Rehber', password: pw, role: 'viewer' } });
  editor = await user('Redaktor', pw);
  viewer = await user('Rehber', pw);
});
afterAll(() => api.close());

describe('RBAC', () => {
  it('viewer oxuyur, yaza bilmir; reject yalnız admin', async () => {
    await expect(viewer.request('/api/scenarios')).resolves.toMatchObject({ scenarios: [] });
    await expect(viewer.sc.create('Viewer ssenarisi')).rejects.toMatchObject({ status: 403 });
    const s = await editor.sc.create('Redaktor ssenarisi');
    await expect(editor.sc.reject(s, 'yox')).rejects.toMatchObject({ status: 403 });
    await expect(
      editor.request('/api/scenarios', { json: { action: 'create', id: 'bad id', name: 'x', changes: [] } }),
    ).rejects.toMatchObject({
      status: 400,
    });
    await editor.sc.remove(s);
  });
});

describe('ssenari canlı dataya yazmır', () => {
  it('yarat → dəyişiklik əlavə et → sil: tasks/employees sənədləri dəyişmir', async () => {
    const before = liveDocs();
    const live = editor.sc.live();
    const owner = curOwner(live.tasks.find((t) => t.id === 'B-25')!);
    let s = await editor.sc.create('Test: ötürmə');
    s = (await editor.sc.addChange(s, makeChange('transfer', 'B-25 → Zümrüd', live, transferIn(live, ['B-25'], 'Zümrüd'))))!;
    s = (await editor.sc.addChange(s, makeChange('norm', 'Norma 1800', live, normIn(scenarioState(live, s.changes), 1800))))!;
    expect(s.changes).toHaveLength(2);
    expect(s.summary?.changes).toBe(2);
    // Ssenari vəziyyəti dəyişib, canlı data yox
    expect(curOwner(scenarioState(live, s.changes).tasks.find((t) => t.id === 'B-25')!)).toBe('Zümrüd');
    expect(curOwner(editor.store.getState().data.tasks.find((t) => t.id === 'B-25')!)).toBe(owner);
    expect(liveDocs()).toBe(before);
    expect(api.fs.dump()['meta/main'].norm ?? 1922).toBe(1922);
    // Digər istifadəçi ssenarini deltada görür
    await admin.store.getState().pull();
    expect(admin.store.getState().scenarios.find((x) => x.id === s.id)?.changes).toHaveLength(2);
    await editor.sc.remove(s);
    await admin.store.getState().pull();
    expect(admin.store.getState().scenarios.some((x) => x.id === s.id)).toBe(false);
    expect(liveDocs()).toBe(before);
  });
});

describe('tətbiq və geri alma', () => {
  it('balanslama ssenarisi: tətbiq sonrası rəqəmlər ssenaridəki ilə eynidir, tək addımla geri alınır', async () => {
    const live = admin.sc.live();
    const r = rebalance(live, { threshold: 1 });
    expect(r.moves.length).toBeGreaterThan(0);
    const s = await admin.sc.create('Balans', [makeChange('rebalance', 'Yükü balansla', live, rebalanceIn(live, r))!]);
    const expected = scenarioImpact(live, s.changes).next;
    const pv = admin.sc.preview(s);
    expect(pv.conflicts).toEqual([]);
    expect(pv.docs).toHaveLength(r.moves.length);

    await admin.sc.apply(s);
    await idle(admin.store);
    const got = computeMetrics(admin.store.getState().data);
    expect(got.over.map((o) => o.name)).toEqual(expected.over.map((o) => o.name));
    expect(got.totalHours).toBeCloseTo(expected.totalHours, 6);
    expect(got.people.map((p) => [p.name, p.load])).toEqual(expected.people.map((p) => [p.name, p.load]));
    // Server tərəfi də eynidir (başqa istifadəçi tam yükləmə)
    await editor.store.getState().pull({ full: true });
    expect(computeMetrics(editor.store.getState().data).over.map((o) => o.name)).toEqual(expected.over.map((o) => o.name));
    const applied = editor.store.getState().scenarios.find((x) => x.id === s.id)!;
    expect(applied.status).toBe('applied');
    expect(applied.revert.length).toBe(r.moves.length);
    // Jurnal qrupu
    const group = admin.store.getState().data.log.filter((l) => l.group === s.id);
    expect(group[0].action).toBe('Ssenari');
    expect(group.filter((l) => l.action === 'Ötürmə')).toHaveLength(r.moves.length);

    // Geri alma
    expect(admin.sc.revertPreview(applied).stale).toEqual([]);
    await admin.sc.revert(applied);
    await idle(admin.store);
    expect(computeMetrics(admin.store.getState().data).over.map((o) => o.name)).toEqual(
      computeMetrics(live).over.map((o) => o.name),
    );
    await editor.store.getState().pull();
    expect(editor.store.getState().scenarios.find((x) => x.id === s.id)?.status).toBe('archived');
  });

  it('ssenaridən sonra eyni sahə dəyişibsə — ziddiyyət; "buraxıl" seçimi həmin sənədə toxunmur', async () => {
    await editor.store.getState().pull();
    const live = editor.sc.live();
    const s0 = await editor.sc.create('Ləğv + ötürmə');
    const mid = cancelIn(live, ['B-30'], true);
    const s = (await editor.sc.setChanges(s0, [
      makeChange('cancel', 'B-30 ləğv', live, mid)!,
      makeChange('transfer', 'B-31 → Zümrüd', mid, transferIn(mid, ['B-31'], 'Zümrüd'))!,
    ]))!;
    // Admin B-30-u ləğv edib geri qaytarır: dəyər eyni qalır, versiya artır → səssiz birləşdirmə (ziddiyyət yox)
    await admin.store.getState().pull();
    admin.store.getState().commit('x', (d) => {
      d.tasks.find((t) => t.id === 'B-30')!.is_cancelled = true;
    });
    await idle(admin.store);
    admin.store.getState().commit('y', (d) => {
      d.tasks.find((t) => t.id === 'B-30')!.is_cancelled = false;
    });
    await idle(admin.store);
    await editor.store.getState().pull();
    expect(editor.sc.preview(s).conflicts).toEqual([]);
    // Admin B-31-i başqasına ötürür (eyni sahə, fərqli dəyər) → ziddiyyət
    admin.store.getState().commit('z', (d) => {
      d.tasks.find((t) => t.id === 'B-31')!.owner_after = 'Orxan';
    });
    await idle(admin.store);
    await editor.store.getState().pull();
    expect(editor.sc.preview(s).conflicts.map((c) => c.key)).toEqual(['B-31']);
    const r = await editor.sc.apply(s, { 'Tasks/B-31': 'skip' });
    await idle(editor.store);
    expect(r.skipped).toBe(1);
    expect(editor.store.getState().data.tasks.find((t) => t.id === 'B-30')!.is_cancelled).toBe(true);
    expect(curOwner(editor.store.getState().data.tasks.find((t) => t.id === 'B-31')!)).toBe('Orxan');
  });
});

describe('təsdiq axını (requireApproval)', () => {
  it('editor göndərir → admin bildiriş alır → rədd/təsdiq → editor bildiriş alır', async () => {
    // Söndürülü olanda submit 400
    const d0 = await editor.sc.create('Qaralama');
    await expect(editor.sc.submit(d0)).rejects.toMatchObject({ status: 400 });
    // Aç
    admin.store.getState().commit('Təsdiq axını', (d) => {
      d.settings.approval = 1;
    });
    await idle(admin.store);
    await editor.store.getState().pull();
    expect(editor.store.getState().data.settings.approval).toBe(1);

    const live = editor.sc.live();
    const s = await editor.sc.create(
      'Böyük ötürmə',
      [makeChange('transfer', 'B-40 → Orxan', live, transferIn(live, ['B-40'], 'Orxan'))!],
      {
        submit: true,
      },
    );
    expect(s.status).toBe('pending');
    // Editor özü tətbiq edə bilmir (server 403)
    await expect(editor.request('/api/scenarios', { json: { action: 'applied', id: s.id, revert: [] } })).rejects.toMatchObject({
      status: 403,
    });
    // Admin bildirişi
    await admin.store.getState().pull();
    const note = admin.store.getState().notifications.find((n) => n.link === `/scenarios/${s.id}`)!;
    expect(note).toMatchObject({ kind: 'approval_request', read: false, to: 'Ecosystem' });
    // Başqasının bildirişini oxunmuş etmək olmur
    await editor.request('/api/notifications', { json: { action: 'read', ids: [note.id] } });
    expect(api.fs.dump()[`notifications/${note.id}`].read).toBe(false);
    await admin.sc.markRead([note.id]);
    expect(api.fs.dump()[`notifications/${note.id}`].read).toBe(true);

    // Rədd
    await admin.sc.reject(
      admin.store.getState().scenarios.find((x) => x.id === s.id)!,
      'Saatı yoxlayın',
    );
    await editor.store.getState().pull();
    expect(editor.store.getState().scenarios.find((x) => x.id === s.id)).toMatchObject({
      status: 'draft',
      decision_comment: 'Saatı yoxlayın',
    });
    expect(editor.store.getState().notifications[0]).toMatchObject({ kind: 'rejected', to: 'Redaktor' });

    // Yenidən göndər → admin təsdiqləyib tətbiq edir
    await editor.sc.submit(editor.store.getState().scenarios.find((x) => x.id === s.id)!);
    await admin.store.getState().pull();
    await admin.sc.apply(admin.store.getState().scenarios.find((x) => x.id === s.id)!);
    await idle(admin.store);
    await editor.store.getState().pull();
    expect(curOwner(editor.store.getState().data.tasks.find((t) => t.id === 'B-40')!)).toBe('Orxan');
    expect(editor.store.getState().notifications[0]).toMatchObject({ kind: 'approved' });
    expect(editor.store.getState().scenarios.find((x) => x.id === s.id)).toMatchObject({
      status: 'applied',
      decided_by: 'Ecosystem',
    });

    // Viewer bildiriş görmür (ona ünvanlanmayıb)
    await viewer.store.getState().pull({ full: true });
    expect(viewer.store.getState().notifications).toEqual([]);
    await editor.sc.remove(d0);
  });
});
