// Domen əməliyyatları (src/store/actions.ts) — real API + mock Firestore ilə; v1 davranışı ilə eyni olmalıdır.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataStore, type DataStore } from '../../src/store/dataStore.js';
import { createActions, type Actions } from '../../src/store/actions.js';
import { memoryPersist } from '../../src/store/persist.js';
import { client, startApi, type TestApi } from '../helpers/apiServer.js';
import { fold, matches, score } from '../../shared/search.js';

let api: TestApi;
let S: DataStore;
let A: Actions;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function idle() {
  for (let i = 0; i < 400; i++) {
    const st = S.getState();
    if (!st.sending && !st.queue.length) return;
    await sleep(5);
  }
}
const doc = (p: string) => api.fs.dump()[p];
const logs = () => Object.values(api.fs.dump()).filter((d) => d.action);

beforeAll(async () => {
  api = await startApi();
  const c = await client(api.base);
  S = createDataStore({ request: c.request, persist: memoryPersist(), retryDelayMs: 0 });
  await S.getState().pull();
  A = createActions(S);
});
afterAll(() => api.close());

describe('tapşırıqlar', () => {
  it('ötürmə: owner_before qorunur, jurnal "Ötürmə"', async () => {
    const t = S.getState().data.tasks.find((x) => x.id === 'B-25')!;
    expect(A.transferTasks(['B-25'], 'Zümrüd', 'balans')).toBe(1);
    await idle();
    expect(doc('tasks/B-25')).toMatchObject({ owner_before: t.owner_before, owner_after: 'Zümrüd' });
    expect(logs().some((l) => l.action === 'Ötürmə' && l.task_id === 'B-25' && l.comment === 'balans' && l.to === 'Zümrüd')).toBe(
      true,
    );
    // Eyni şəxsə təkrar ötürmə → heç nə
    expect(A.transferTasks(['B-25'], 'Zümrüd')).toBe(0);
  });

  it('owner_before boşdursa cari sahib yazılır; yeni ad əməkdaş kimi yaranır', async () => {
    const id = A.saveTask(
      null,
      {
        company: 'Birbank',
        process: 'P',
        category: 'K',
        task: 'Test işi',
        description: '',
        min_per_key: 10,
        annual_freq: 12,
        unit: 'say',
        hours: 2,
        after_opt: null,
      },
      'Ülkər',
    )!;
    A.transferTasks([id], 'Yeni Şəxs');
    await idle();
    expect(doc(`tasks/${id}`)).toMatchObject({ owner_before: 'Ülkər', owner_after: 'Yeni Şəxs', hours: '2' });
    expect(doc('employees/Yeni Şəxs')).toMatchObject({ activity: 'Administrativ', fte: '1' });
  });

  it('ləğv / bərpa', async () => {
    expect(A.setCancelled(['B-1', 'B-2'], true, 'avtomatlaşdırıldı')).toBe(2);
    await idle();
    expect(doc('tasks/B-1').is_cancelled).toBe(true);
    expect(A.setCancelled(['B-1'], true)).toBe(0);
    A.setCancelled(['B-1', 'B-2'], false);
    await idle();
    expect(doc('tasks/B-2').is_cancelled).toBe(false);
    expect(logs().filter((l) => l.action === 'Bərpa')).toHaveLength(2);
  });

  it('düzəliş: dəyişən sahə + icraçı dəyişməsi → "Düzəliş" və "Ötürmə"', async () => {
    const t = S.getState().data.tasks.find((x) => x.id === 'B-3')!;
    A.saveTask(t, { ...t, hours: 77 }, 'Aysel');
    await idle();
    expect(doc('tasks/B-3')).toMatchObject({ hours: '77', owner_after: 'Aysel' });
    const mine = logs()
      .filter((l) => l.task_id === 'B-3')
      .map((l) => l.action);
    expect(mine).toEqual(expect.arrayContaining(['Düzəliş', 'Ötürmə']));
    // Heç nə dəyişməyibsə commit yoxdur
    const t2 = S.getState().data.tasks.find((x) => x.id === 'B-3')!;
    expect(A.saveTask(t2, t2, 'Aysel')).toBeNull();
  });

  it('silmə yumşaqdır', async () => {
    A.deleteTasks(['B-4']);
    await idle();
    expect(doc('tasks/B-4')._deleted).toBe(true);
  });
});

describe('əməkdaşlar', () => {
  it('yeni, mövcud ad → exists', async () => {
    const e = { name: 'Test Əməkdaş', company: 'Birbank', activity: 'Administrativ', fte: 0.5, is_group: false, active: true };
    expect(A.saveEmployee(null, e)).toBe('created');
    expect(A.saveEmployee(null, e)).toBe('exists');
    await idle();
    expect(doc('employees/Test Əməkdaş').fte).toBe(0.5);
  });

  it('ad dəyişmə bütün tapşırıqlarda əks olunur', async () => {
    const before = S.getState().data.tasks.filter((t) => t.owner_after === 'Kamilə' || t.owner_before === 'Kamilə').length;
    expect(before).toBeGreaterThan(0);
    const e = S.getState().data.employees.find((x) => x.name === 'Kamilə')!;
    expect(A.saveEmployee('Kamilə', { ...e, name: 'Kamilə Y' })).toBe('updated');
    await idle();
    expect(doc('employees/Kamilə')._deleted).toBe(true);
    expect(doc('employees/Kamilə Y')).toBeTruthy();
    expect(S.getState().data.tasks.filter((t) => t.owner_after === 'Kamilə' || t.owner_before === 'Kamilə')).toHaveLength(0);
  });

  it('birləşdirmə: Kamilə Y → Kamila', async () => {
    const e = S.getState().data.employees.find((x) => x.name === 'Kamilə Y')!;
    const n = S.getState().data.tasks.filter((t) => [t.owner_after, t.owner_before].includes('Kamila')).length;
    expect(A.saveEmployee('Kamilə Y', { ...e, name: 'Kamila' })).toBe('merged');
    await idle();
    expect(
      S.getState()
        .data.employees.filter((x) => x.name.startsWith('Kamil'))
        .map((x) => x.name),
    ).toEqual(['Kamila']);
    expect(S.getState().data.tasks.filter((t) => [t.owner_after, t.owner_before].includes('Kamila')).length).toBeGreaterThan(n);
    expect(logs().some((l) => String(l.task_label).includes('birləşdirildi'))).toBe(true);
    expect(S.getState().conflicts).toHaveLength(0);
  });

  it('tapşırığı olan əməkdaş silinmir; olmayan silinir', async () => {
    expect(A.deleteEmployee('Kamila')).toBe(false);
    expect(A.deleteEmployee('Test Əməkdaş')).toBe(true);
    await idle();
    expect(doc('employees/Test Əməkdaş')._deleted).toBe(true);
  });

  it('hamısını ötür', async () => {
    const n = S.getState().data.tasks.filter((t) => !t.is_cancelled && (t.owner_after || t.owner_before) === 'Ülvi').length;
    expect(A.transferAll('Ülvi', 'Zümrüd')).toBe(n);
    await idle();
    expect(S.getState().data.tasks.filter((t) => !t.is_cancelled && (t.owner_after || t.owner_before) === 'Ülvi')).toHaveLength(
      0,
    );
  });

  it('geri al bütün ötürmələri serverdə qaytarır', async () => {
    S.getState().undoLast();
    await idle();
    expect(
      S.getState().data.tasks.filter((t) => !t.is_cancelled && (t.owner_after || t.owner_before) === 'Ülvi').length,
    ).toBeGreaterThan(0);
    expect(S.getState().conflicts).toHaveLength(0);
  });
});

describe('axtarış', () => {
  it('Azərbaycan hərfləri bərabərdir', () => {
    expect(fold('Ülkər İSMAYILOVA Şəkər')).toBe('ulker ismayilova seker');
    expect(matches('Kəsişmələrin yoxlanılması', 'kesisme yoxlan')).toBe(true);
    expect(matches('Kəsişmələrin yoxlanılması', 'xyz')).toBe(false);
  });
  it('xal sıralaması', () => {
    expect(score('Ülkər', 'ulker')).toBe(100);
    expect(score('Ülkər Həsənova', 'ulk')).toBe(80);
    expect(score('Ayın bağlanması', 'baglan')).toBe(60);
    expect(score('Aidiyyatı şəxs', 'adyt')).toBe(10);
    expect(score('Aidiyyatı', 'zz')).toBe(0);
  });
});
