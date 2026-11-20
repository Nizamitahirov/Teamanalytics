// shared/apply.ts — op-ların lokal tətbiqi, birləşdirmə, ziddiyyət, geri alma (SPEC §6.5).
import { describe, expect, it } from 'vitest';
import {
  applyOpsLocal,
  compileOps,
  currentDocs,
  invertOps,
  resolveVersions,
  staleDocs,
  type Snapshot,
} from '../../shared/apply.js';
import { diffOps, normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import type { Op } from '../../shared/schema.js';

const base = (): Snapshot => ({
  tasks: [
    { ...normalizeTask({ id: 'A', process: 'P', task: 'a', owner_before: 'Ali', hours: 100 }), _v: 3 },
    { ...normalizeTask({ id: 'B', process: 'P', task: 'b', owner_before: 'Vali', hours: 50 }), _v: 1 },
  ],
  employees: [
    { ...normalizeEmployee({ name: 'Ali' }), _v: 1 },
    { ...normalizeEmployee({ name: 'Vali' }), _v: 1 },
  ],
  settings: { ...DEFAULT_SETTINGS },
});

describe('applyOpsLocal', () => {
  it('yalnız göndərilən sahələri dəyişir, girişi dəyişmir', () => {
    const s = base();
    const frozen = JSON.stringify(s);
    const out = applyOpsLocal(s, [{ t: 'upsert', table: 'Tasks', row: { id: 'A', owner_after: 'Vali' }, v: 3 }]);
    const a = out.tasks.find((t) => t.id === 'A')!;
    expect(a.owner_after).toBe('Vali');
    expect(a.hours).toBe(100);
    expect(a._v).toBe(3);
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('yeni sənəd, silmə, ayar', () => {
    const out = applyOpsLocal(base(), [
      { t: 'upsert', table: 'Tasks', row: { id: 'N', task: 'yeni', hours: 5, owner_after: 'Ali' }, v: 0 },
      { t: 'delete', table: 'Tasks', key: 'B', v: 1 },
      { t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1800 } },
    ]);
    expect(out.tasks.map((t) => t.id).sort()).toEqual(['A', 'N']);
    expect(out.settings.norm).toBe(1800);
  });

  it('ssenari yazılanda olan, sonra silinən sənəd yenidən yaranmır', () => {
    const s = base();
    s.tasks = s.tasks.filter((t) => t.id !== 'B');
    const out = applyOpsLocal(s, [{ t: 'upsert', table: 'Tasks', row: { id: 'B', hours: 1 }, v: 1 }]);
    expect(out.tasks.some((t) => t.id === 'B')).toBe(false);
  });
});

describe('compileOps', () => {
  it('eyni sənədin dəyişikliklərini birləşdirir: ilk v, ilk base', () => {
    const ops: Op[] = [
      { t: 'upsert', table: 'Tasks', row: { id: 'A', hours: 80 }, v: 3, base: { hours: 100 } },
      {
        t: 'upsert',
        table: 'Tasks',
        row: { id: 'A', hours: 60, owner_after: 'Vali' },
        v: 3,
        base: { hours: 80, owner_after: null },
      },
    ];
    expect(compileOps(ops)).toEqual([
      {
        t: 'upsert',
        table: 'Tasks',
        row: { id: 'A', hours: 60, owner_after: 'Vali' },
        v: 3,
        base: { hours: 100, owner_after: null },
      },
    ]);
  });

  it('yaradılıb silinən sənəd heç nə yazmır; ayarın son dəyəri qalır', () => {
    const ops: Op[] = [
      { t: 'upsert', table: 'Tasks', row: { id: 'N', hours: 5 }, v: 0, base: {} },
      { t: 'delete', table: 'Tasks', key: 'N', v: 0 },
      { t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1800 } },
      { t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1700 } },
    ];
    expect(compileOps(ops)).toEqual([{ t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1700 } }]);
  });
});

describe('ziddiyyət və geri alma', () => {
  it('ssenaridən sonra eyni sahə dəyişib → ziddiyyət; fərqli sahə → səssiz birləşdirmə', () => {
    const s0 = base();
    const scen = applyOpsLocal(s0, [{ t: 'upsert', table: 'Tasks', row: { id: 'A', hours: 70 } }]);
    const ops = diffOps(s0, scen); // v=3, base {hours:100}
    // Başqası A-nın icraçısını dəyişdi (fərqli sahə, _v 4)
    const other: Snapshot = { ...s0, tasks: s0.tasks.map((t) => (t.id === 'A' ? { ...t, owner_after: 'X', _v: 4 } : t)) };
    expect(resolveVersions(ops, currentDocs(other, ops)).conflicts).toEqual([]);
    // Başqası saatı dəyişdi (eyni sahə)
    const clash: Snapshot = { ...s0, tasks: s0.tasks.map((t) => (t.id === 'A' ? { ...t, hours: 90, _v: 4 } : t)) };
    const r = resolveVersions(ops, currentDocs(clash, ops));
    expect(r.conflicts.map((c) => c.key)).toEqual(['A']);
    expect(r.accepted.filter((o) => o.t !== 'log')).toEqual([]);
  });

  it('invertOps: tətbiq + əks = ilkin vəziyyət', () => {
    const s0 = base();
    const ops: Op[] = [
      { t: 'upsert', table: 'Tasks', row: { id: 'A', owner_after: 'Vali', hours: 10 }, v: 3 },
      { t: 'upsert', table: 'Tasks', row: { id: 'N', task: 'yeni', hours: 5 }, v: 0 },
      { t: 'delete', table: 'Tasks', key: 'B', v: 1 },
      { t: 'upsert', table: 'Employees', row: { name: 'Ali', fte: 0.5 }, v: 1 },
      { t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1700 } },
    ];
    const after = applyOpsLocal(s0, ops);
    const inv = invertOps(s0, ops);
    const back = applyOpsLocal(after, inv);
    const strip = (s: Snapshot) => ({
      tasks: [...s.tasks].sort((a, b) => a.id.localeCompare(b.id)).map((t) => ({ ...t, _v: 0 })),
      employees: s.employees.map((e) => ({ ...e, _v: 0 })),
      settings: s.settings,
    });
    expect(strip(back)).toEqual(strip(s0));
    expect(staleDocs(after, inv)).toEqual([]);
    // Tətbiqdən sonra A başqa yolla dəyişib → geri almada xəbərdarlıq
    const changed: Snapshot = { ...after, tasks: after.tasks.map((t) => (t.id === 'A' ? { ...t, hours: 999 } : t)) };
    expect(staleDocs(changed, inv)).toEqual(['Tasks/A']);
  });
});
