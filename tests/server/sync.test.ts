// Sync mühərriki — iki "istifadəçi" (iki store) real API funksiyaları + mock Firestore ilə (SPEC §4.3, Mərhələ 2 QM).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataStore, type DataStore } from '../../src/store/dataStore.js';
import { memoryPersist } from '../../src/store/persist.js';
import type { TaskDoc } from '../../shared/model.js';
import { client, startApi, type TestApi } from '../helpers/apiServer.js';

let api: TestApi;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function idle(s: DataStore) {
  for (let i = 0; i < 400; i++) {
    const st = s.getState();
    if (!st.sending && (!st.queue.length || !st.online)) return;
    await sleep(5);
  }
  throw new Error('store idle olmadı');
}
const doc = (path: string) => api.fs.dump()[path];
const task = (s: DataStore, id: string) => s.getState().data.tasks.find((t) => t.id === id)!;

async function makeStore(user = 'Ecosystem', password = 'Ecosystem', persist = memoryPersist()) {
  const c = await client(api.base, user, password);
  const store = createDataStore({ request: c.request, persist, retryDelayMs: 0 });
  await store.getState().pull();
  return { store, net: c.state, persist };
}

let A: DataStore;
let B: DataStore;

beforeAll(async () => {
  api = await startApi();
  const admin = await makeStore();
  A = admin.store;
  // İkinci istifadəçi
  const c = await client(api.base);
  await c.request('/api/users', { json: { action: 'add', name: 'Aysel', password: 'Gizli-Soz-2026!' } });
  B = (await makeStore('Aysel', 'Gizli-Soz-2026!')).store;
});
afterAll(() => api.close());

describe('əsas axın', () => {
  it('tam yükləmə: 341 tapşırıq, versiyalar 1', () => {
    expect(A.getState().data.tasks).toHaveLength(341);
    expect(A.getState().ready).toBe(true);
    expect(task(A, 'B-25')._v).toBe(1); // seed yazması _v-ni 1 edir
  });

  it('ötürmə yalnız dəyişən sahələri göndərir, versiya artır, B deltada görür', async () => {
    const before = api.fs.calls.length;
    A.getState().commit(
      'B-25 ötürüldü',
      (d) => {
        const t = d.tasks.find((x) => x.id === 'B-25')!;
        t.owner_after = 'Zümrüd';
        t.updated_at = '2026-11-19T10:00:00.000Z';
      },
      [{ action: 'Ötürmə', task_id: 'B-25', from: 'Ülvi', to: 'Zümrüd' }],
    );
    expect(task(A, 'B-25').owner_after).toBe('Zümrüd'); // optimistik
    await idle(A);
    expect(api.fs.calls.slice(before).filter((c) => c.endsWith(':batchGet'))).toHaveLength(1);
    expect(doc('tasks/B-25')).toMatchObject({ owner_after: 'Zümrüd', updated_by: 'Ecosystem', _v: '2' });
    expect(task(A, 'B-25')._v).toBe(2);
    expect(A.getState().status).toBe('idle');

    expect(await B.getState().pull()).toBe(true);
    expect(task(B, 'B-25')).toMatchObject({ owner_after: 'Zümrüd', _v: 2 });
    expect(B.getState().data.log.some((l) => l.action === 'Ötürmə' && l.user === 'Ecosystem')).toBe(true);
  });
});

describe('versiya ziddiyyəti (iki istifadəçi)', () => {
  it('eyni sahə: ikinci yazan ziddiyyət alır, onun jurnal qeydi yazılmır', async () => {
    await Promise.all([A.getState().pull(), B.getState().pull()]);
    A.getState().commit('A', (d) => void (d.tasks.find((x) => x.id === 'B-1')!.owner_after = 'Ülkər'), [
      { action: 'Ötürmə', task_id: 'B-1', comment: 'A-nın qeydi' },
    ]);
    await idle(A);
    B.getState().commit('B', (d) => void (d.tasks.find((x) => x.id === 'B-1')!.owner_after = 'Hüseyn'), [
      { action: 'Ötürmə', task_id: 'B-1', comment: 'B-nin qeydi' },
    ]);
    await idle(B);
    expect(doc('tasks/B-1').owner_after).toBe('Ülkər');
    const [c] = B.getState().conflicts;
    expect(c).toMatchObject({ table: 'Tasks', key: 'B-1', by: 'Ecosystem', v: 2 });
    expect(c.theirs?.owner_after).toBe('Ülkər');
    expect((c.mine as TaskDoc | null)?.owner_after).toBe('Hüseyn');
    const logs = Object.values(api.fs.dump()).filter((d) => d.comment === 'B-nin qeydi');
    expect(logs).toHaveLength(0);
  });

  it('"Onun versiyası" → lokal data serverlə eyniləşir, yazma yoxdur', async () => {
    const commits = api.fs.calls.filter((c) => c.endsWith(':commit')).length;
    B.getState().resolveConflict(B.getState().conflicts[0], 'theirs');
    await idle(B);
    expect(task(B, 'B-1')).toMatchObject({ owner_after: 'Ülkər', _v: 2 });
    expect(B.getState().conflicts).toHaveLength(0);
    expect(api.fs.calls.filter((c) => c.endsWith(':commit')).length).toBe(commits);
  });

  it('"Mənimki" → serverə bizim versiya yazılır, A deltada görür', async () => {
    B.getState().commit('B2', (d) => void (d.tasks.find((x) => x.id === 'B-1')!.owner_after = 'Hüseyn'));
    // A da eyni anda dəyişir (B hələ bilmir)
    A.getState().commit('A2', (d) => void (d.tasks.find((x) => x.id === 'B-1')!.owner_after = 'Zümrüd'));
    await idle(A);
    await idle(B);
    // Hansı birinci yazdısa — o biri ziddiyyət alır
    const loser = B.getState().conflicts.length ? B : A;
    const winner = loser === B ? A : B;
    expect(loser.getState().conflicts).toHaveLength(1);
    const mine = (loser.getState().conflicts[0].mine as TaskDoc | null)?.owner_after;
    loser.getState().resolveConflict(loser.getState().conflicts[0], 'mine');
    await idle(loser);
    expect(loser.getState().conflicts).toHaveLength(0);
    expect(doc('tasks/B-1').owner_after).toBe(mine);
    await winner.getState().pull();
    expect(task(winner, 'B-1').owner_after).toBe(mine);
    expect(Object.values(api.fs.dump()).some((d) => d.action === 'Ziddiyyət')).toBe(true);
  });

  it('fərqli sahələr → səssiz birləşdirmə (ziddiyyət yoxdur)', async () => {
    await Promise.all([A.getState().pull(), B.getState().pull()]);
    A.getState().commit('saat', (d) => void (d.tasks.find((x) => x.id === 'B-3')!.hours = 99));
    await idle(A);
    B.getState().commit('icraçı', (d) => void (d.tasks.find((x) => x.id === 'B-3')!.owner_after = 'Aysel'));
    await idle(B);
    expect(B.getState().conflicts).toHaveLength(0);
    expect(doc('tasks/B-3')).toMatchObject({ hours: '99', owner_after: 'Aysel', _v: '3' });
  });

  it('silinmiş tapşırığı redaktə → ziddiyyət (theirs = null)', async () => {
    await Promise.all([A.getState().pull(), B.getState().pull()]);
    A.getState().commit('sil', (d) => void (d.tasks = d.tasks.filter((x) => x.id !== 'B-5')));
    await idle(A);
    B.getState().commit('redaktə', (d) => void (d.tasks.find((x) => x.id === 'B-5')!.hours = 1));
    await idle(B);
    expect(B.getState().conflicts[0]).toMatchObject({ key: 'B-5', theirs: null });
    B.getState().resolveConflict(B.getState().conflicts[0], 'theirs');
    expect(B.getState().data.tasks.some((t) => t.id === 'B-5')).toBe(false);
  });

  it('v1 klientinin yazması da versiyanı artırır → köhnə v2 redaktəsi ziddiyyət alır', async () => {
    await B.getState().pull();
    const v1 = await client(api.base);
    const row = { ...doc('tasks/B-6') };
    for (const k of Object.keys(row)) if (k.startsWith('_')) delete row[k];
    await v1.request('/api/ops', { json: { ops: [{ t: 'upsert', table: 'Tasks', row: { ...row, hours: 7 } }] } });
    B.getState().commit('x', (d) => void (d.tasks.find((x) => x.id === 'B-6')!.hours = 8));
    await idle(B);
    expect(B.getState().conflicts.find((c) => c.key === 'B-6')?.theirs?.hours).toBe(7);
    B.getState().resolveConflict(
      B.getState().conflicts.find((c) => c.key === 'B-6')!,
      'theirs',
    );
  });
});

describe('özümüzlə ziddiyyət olmur', () => {
  it('cavab gəlmədən ardıcıl 3 dəyişiklik + silmə', async () => {
    await A.getState().pull();
    const s = A.getState();
    s.commit('1', (d) => void (d.tasks.find((x) => x.id === 'B-7')!.hours = 1));
    s.commit('2', (d) => void (d.tasks.find((x) => x.id === 'B-7')!.hours = 2));
    s.commit('3', (d) => void (d.tasks.find((x) => x.id === 'B-7')!.hours = 3));
    s.commit('4', (d) => void (d.tasks = d.tasks.filter((x) => x.id !== 'B-7')));
    await idle(A);
    expect(A.getState().conflicts).toHaveLength(0);
    expect(doc('tasks/B-7')._deleted).toBe(true);
  });

  it('geri al / irəli al serverə diff kimi gedir', async () => {
    await A.getState().pull();
    const before = task(A, 'B-8').hours;
    A.getState().commit('saat', (d) => void (d.tasks.find((x) => x.id === 'B-8')!.hours = 500));
    await idle(A);
    expect(Number(doc('tasks/B-8').hours)).toBe(500);
    A.getState().undoLast();
    await idle(A);
    expect(Number(doc('tasks/B-8').hours)).toBe(before);
    expect(A.getState().redo).toHaveLength(1);
    A.getState().redoLast();
    await idle(A);
    expect(Number(doc('tasks/B-8').hours)).toBe(500);
    expect(A.getState().conflicts).toHaveLength(0);
    const actions = Object.values(api.fs.dump()).map((d) => d.action);
    expect(actions).toContain('Geri alma');
    expect(actions).toContain('İrəli alma');
  });

  it('yeni commit irəli al siyahısını təmizləyir; undo limiti 30', async () => {
    const s = A.getState();
    s.undoLast();
    s.commit('yeni', (d) => void (d.tasks.find((x) => x.id === 'B-8')!.hours = 501));
    expect(A.getState().redo).toHaveLength(0);
    for (let i = 0; i < 35; i++) A.getState().commit(`c${i}`, (d) => void (d.tasks.find((x) => x.id === 'B-9')!.hours = i + 1));
    expect(A.getState().undo).toHaveLength(30);
    await idle(A);
    expect(Number(doc('tasks/B-9').hours)).toBe(35);
    expect(A.getState().conflicts).toHaveLength(0);
  });
});

describe('offline növbə + IndexedDB keşi', () => {
  it('offline dəyişikliklər keşdə saxlanır, "yenidən açılışdan" sonra göndərilir', async () => {
    const persist = memoryPersist();
    const { store, net } = await makeStore('Ecosystem', 'Ecosystem', persist);
    net.offline = true;
    store.getState().setOnline(false);
    store.getState().commit('offline 1', (d) => void (d.tasks.find((x) => x.id === 'B-10')!.hours = 11));
    store.getState().commit('offline 2', (d) => void (d.tasks.find((x) => x.id === 'B-11')!.hours = 12));
    expect(store.getState().status).toBe('offline');
    expect(store.getState().queue).toHaveLength(2);
    await sleep(80);
    expect(persist.value?.queue).toHaveLength(2);
    expect(Number(doc('tasks/B-10').hours)).not.toBe(11);

    // Səhifə bağlanıb yenidən açıldı: yeni store eyni keşdən
    const again = await client(api.base);
    const reopened = createDataStore({ request: again.request, persist, retryDelayMs: 0 });
    await reopened.getState().hydrate();
    expect(reopened.getState().ready).toBe(true);
    expect(reopened.getState().queue).toHaveLength(2);
    expect(reopened.getState().data.tasks.find((t) => t.id === 'B-10')?.hours).toBe(11);
    // Növbə varkən pull serverdən gələni tətbiq etmir
    expect(await reopened.getState().pull()).toBe(false);
    reopened.getState().setOnline(true);
    await idle(reopened);
    expect(Number(doc('tasks/B-10').hours)).toBe(11);
    expect(Number(doc('tasks/B-11').hours)).toBe(12);
    expect(reopened.getState().conflicts).toHaveLength(0);
    expect(reopened.getState().status).toBe('idle');
  });

  it('şəbəkə yoxdursa pull offline statusu qoyur', async () => {
    const { store, net } = await makeStore();
    net.offline = true;
    await expect(store.getState().pull()).rejects.toThrow();
    expect(store.getState()).toMatchObject({ online: false, status: 'offline' });
  });

  it('server dəyişikliyi rədd edirsə növbə atılır və tam yükləmə olur', async () => {
    const { store } = await makeStore();
    store.getState().commit('pis', (d) => void (d.tasks.find((x) => x.id === 'B-12')!.task = 'x'.repeat(3000)));
    await idle(store);
    await sleep(20);
    expect(store.getState().status).toBe('error');
    expect(store.getState().queue).toHaveLength(0);
    expect(task(store, 'B-12').task).not.toBe('x'.repeat(3000));
  });
});

describe('təkrar göndərmə (at-least-once)', () => {
  it('cavab gəldi, amma keş köhnə qaldı → yenidən açılışda ziddiyyət yaranmır', async () => {
    const persist = memoryPersist();
    const { store, net } = await makeStore('Ecosystem', 'Ecosystem', persist);
    net.offline = true;
    store.getState().setOnline(false);
    store.getState().commit('ləğv', (d) => void (d.tasks.find((x) => x.id === 'B-20')!.is_cancelled = true));
    await sleep(80);
    const stale = structuredClone(persist.value!); // növbədə ləğv partiyası var
    expect(stale.queue).toHaveLength(1);
    net.offline = false;
    store.getState().setOnline(true);
    await idle(store);
    expect(doc('tasks/B-20').is_cancelled).toBe(true);
    const v = doc('tasks/B-20')._v;
    // Brauzer köhnə keşlə açılır və eyni partiyanı təkrar göndərir
    persist.value = stale;
    const c = await client(api.base);
    const reopened = createDataStore({ request: c.request, persist, retryDelayMs: 0 });
    await reopened.getState().hydrate();
    await reopened.getState().flush();
    await idle(reopened);
    expect(reopened.getState().conflicts).toHaveLength(0);
    expect(doc('tasks/B-20')._v).toBe(v); // təkrar yazılmayıb
    expect(reopened.getState().data.tasks.find((t) => t.id === 'B-20')?._v).toBe(Number(v));
  });
});
