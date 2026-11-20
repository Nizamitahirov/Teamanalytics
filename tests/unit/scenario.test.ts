// Ssenarilər və balanslama (SPEC §6.5, §8) — seed üzərində.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { curOwner, normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { computeMetrics } from '../../shared/metrics.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import { applyOpsTo, type Snapshot } from '../../shared/apply.js';
import { BUFFER, rebalance } from '../../shared/rebalance.js';
import {
  addEmployeeChange,
  applyLogs,
  automateChange,
  cancelChange,
  compare,
  findConflicts,
  hireTemplate,
  hoursChange,
  impactOf,
  leaveTemplate,
  newTaskChange,
  normChange,
  rebalanceChanges,
  scenarioData,
  transferChange,
  transferHours,
  withBase,
} from '../../shared/scenario.js';
import { ScenarioChangeSchema } from '../../shared/schema.js';

const raw = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const live: Snapshot = Object.freeze({
  tasks: raw.tasks.map(normalizeTask),
  employees: raw.employees.map(normalizeEmployee),
  settings: { ...DEFAULT_SETTINGS },
}) as Snapshot;
const ctx = { scen: live, live };
const json = (x: unknown) => JSON.stringify(x);
const liveJson = json(live);

describe('applyOpsTo', () => {
  it('yalnız göndərilən sahələri dəyişir, bazanı dəyişmir', () => {
    const t = live.tasks[0];
    const out = applyOpsTo(live, [{ t: 'upsert', table: 'Tasks', row: { id: t.id, hours: 999 } }]);
    const x = out.tasks.find((y) => y.id === t.id)!;
    expect(x.hours).toBe(999);
    expect(x.task).toBe(t.task);
    expect(x.owner_before).toBe(t.owner_before);
    expect(json(live)).toBe(liveJson);
    // Dəyişməyən sənədlər eyni obyekt (sürət)
    expect(out.tasks[1]).toBe(live.tasks[1]);
  });
  it('yeni sənəd, silmə, ayar, jurnal nəzərə alınmır', () => {
    const out = applyOpsTo(live, [
      { t: 'upsert', table: 'Employees', row: { name: 'Yeni Adam', fte: 0.5 } },
      { t: 'delete', table: 'Tasks', key: live.tasks[0].id },
      { t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1800 } },
      { t: 'log', row: { action: 'x' } },
    ]);
    expect(out.employees.find((e) => e.name === 'Yeni Adam')).toMatchObject({ fte: 0.5, active: true, is_group: false });
    expect(out.tasks.length).toBe(live.tasks.length - 1);
    expect(out.settings.norm).toBe(1800);
  });
});

describe('rebalance (SPEC §8 QM)', () => {
  const res = rebalance(live);

  it('(a) deterministikdir: eyni giriş → eyni çıxış', () => {
    expect(json(rebalance(live))).toBe(json(res));
    // Massivin sırası nəticəyə təsir etmir
    const shuffled = { ...live, tasks: [...live.tasks].reverse(), employees: [...live.employees].reverse() };
    expect(json(rebalance(shuffled).transfers)).toBe(json(res.transfers));
  });

  it('normanı aşanlar (Ülkər, Sveta x, Ağaəli) üçün təklif var və onlar ≤ 100%-ə enir', () => {
    expect(res.transfers.length).toBeGreaterThan(0);
    const donors = new Set(res.transfers.map((t) => t.from));
    expect([...donors].sort()).toEqual(['Ağaəli', 'Sveta x', 'Ülkər'].sort());
    for (const d of donors) if (!res.shortfall.some((s) => s.name === d)) expect(res.after[d]).toBeLessThanOrEqual(1 + 1e-9);
    // Kiçik işlər əvvəl: hər donor üçün saatlar artan sırada
    for (const d of donors) {
      const hs = res.transfers.filter((t) => t.from === d).map((t) => t.hours);
      expect(hs).toEqual([...hs].sort((a, b) => a - b));
    }
  });

  it('(b) heç bir qəbul edən θ−0,05-i keçmir', () => {
    const receivers = new Set(res.transfers.map((t) => t.to));
    for (const r of receivers) expect(res.after[r]).toBeLessThanOrEqual(1 - BUFFER + 1e-9);
  });

  it('nəticə tətbiq ediləndə computeMetrics eyni yükləri göstərir; şirkət qaydası (S3) pozulmur', () => {
    const scen = scenarioData(live, rebalanceChanges(ctx, res));
    const m = computeMetrics(scen);
    for (const p of m.people) expect(p.load).toBeCloseTo(res.after[p.name] ?? 0, 9);
    expect(m.over.length).toBe(res.shortfall.length);
    const emp = new Map(live.employees.map((e) => [e.name, e]));
    for (const tr of res.transfers) {
      const t = live.tasks.find((x) => x.id === tr.taskId)!;
      expect(emp.get(tr.to)!.company).toBe(t.company);
    }
    // Ümumi iş həcmi dəyişmir (yalnız ötürmə)
    expect(m.totalHours).toBeCloseTo(computeMetrics(live).totalHours, 6);
  });

  it('(c) çatışmazlıq: qəbul edən yoxdursa qalıq düzgün hesablanır', () => {
    // Hamının tutumu dolu: θ = 0,3 → çoxları donor, az qəbul edən
    const tight = rebalance(live, { theta: 0.3 });
    const m = computeMetrics(scenarioData(live, rebalanceChanges(ctx, tight)));
    for (const s of tight.shortfall) {
      const p = m.people.find((x) => x.name === s.name)!;
      expect(s.hours).toBeCloseTo(p.hours - 0.3 * p.cap, 6);
    }
    // Yeganə əməkdaş: heç kimə ötürmək olmur → bütün artıq saat qalıqdır
    const one = {
      ...live,
      employees: [normalizeEmployee({ name: 'Tək', fte: 1 })],
      tasks: [normalizeTask({ id: 'A', process: 'P', task: 'T', owner_before: 'Tək', hours: 2500 })],
    };
    const r1 = rebalance(one);
    expect(r1.transfers).toEqual([]);
    expect(r1.shortfall).toEqual([{ name: 'Tək', hours: 2500 - 1922 }]);
  });

  it('kilidli işlər toxunulmur; evacuate bütün işləri paylayır', () => {
    const locked = res.transfers.map((t) => t.taskId);
    const r2 = rebalance(live, { locked });
    expect(r2.transfers.some((t) => locked.includes(t.taskId))).toBe(false);
    const name = 'Aysel';
    const ev = rebalance(live, { evacuate: [name], sameCompany: false });
    const own = live.tasks.filter((t) => !t.is_cancelled && curOwner(t) === name);
    expect(
      ev.transfers.filter((t) => t.from === name).length + (ev.shortfall.find((s) => s.name === name) ? 1 : 0),
    ).toBeGreaterThanOrEqual(Math.min(own.length, 1));
    expect(ev.transfers.some((t) => t.to === name)).toBe(false);
  });

  it('341 iş ≤ 50 ms', () => {
    rebalance(live); // isinmə
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) rebalance(live);
    expect((performance.now() - t0) / 5).toBeLessThan(50);
  });
});

describe('ssenari dəyişiklikləri', () => {
  const t = live.tasks.find((x) => !x.is_cancelled && x.owner_before && !x.owner_after)!;

  it('ötürmə v1 qaydasını saxlayır və base canlı datadan gəlir', () => {
    const c = transferChange(ctx, [t.id], 'Aygül')!;
    const op = c.ops.find((o) => o.table === 'Tasks')!;
    expect(op.row).toEqual({ id: t.id, owner_after: 'Aygül' });
    expect(op.base).toEqual({ owner_after: '' === t.owner_after ? '' : t.owner_after });
    const out = scenarioData(live, [c]).tasks.find((x) => x.id === t.id)!;
    expect(out.owner_before).toBe(t.owner_before);
    expect(curOwner(out)).toBe('Aygül');
    expect(ScenarioChangeSchema.safeParse(c).success).toBe(true);
    // Mövcud olmayan icraçı → əməkdaş da yaradılır
    const c2 = transferChange(ctx, [t.id], 'Tamamilə Yeni')!;
    expect(c2.ops[0]).toMatchObject({ table: 'Employees', row: { name: 'Tamamilə Yeni' } });
  });

  it('bütün qurucular Zod sxeminə uyğundur və mənasız dəyişiklik null qaytarır', () => {
    const p = live.tasks.find((x) => !x.is_cancelled)!.process;
    const all = [
      cancelChange(ctx, [t.id]),
      hoursChange(ctx, t.id, 1),
      newTaskChange(ctx, { id: 'T-x1', company: 'Birbank', process: 'P', task: 'Yeni iş', hours: 50, owner: 'Aygül' }),
      addEmployeeChange(ctx, { name: 'Gələn', company: 'Birbank', activity: 'Administrativ', fte: 1 }),
      normChange(ctx, 1800),
      automateChange(ctx, p, 30),
    ];
    for (const c of all) expect(ScenarioChangeSchema.safeParse(c).success).toBe(true);
    expect(hoursChange(ctx, t.id, t.hours)).toBeNull();
    expect(transferChange(ctx, [t.id], curOwner(t))).toBeNull();
    expect(normChange(ctx, live.settings.norm)).toBeNull();
    expect(addEmployeeChange(ctx, { name: live.employees[0].name, company: 'Birbank', activity: 'x', fte: 1 })).toBeNull();
  });

  it('avtomatlaşdırma prosesin saatını X% azaldır; norma dəyişməsi FTE-ni dəyişir', () => {
    const p = live.tasks.find((x) => !x.is_cancelled)!.process;
    const before = live.tasks.filter((x) => x.process === p && !x.is_cancelled).reduce((s, x) => s + x.hours, 0);
    const scen = scenarioData(live, [automateChange(ctx, p, 50)!]);
    const after = scen.tasks.filter((x) => x.process === p && !x.is_cancelled).reduce((s, x) => s + x.hours, 0);
    expect(after).toBeCloseTo(before / 2, 1);
    const im = impactOf(live, [normChange(ctx, 1922 / 2)!]);
    expect(im.dFte).toBeCloseTo(computeMetrics(live).fteNeed, 6);
  });

  it('şablonlar: "əməkdaş ayrılır" və "yeni əməkdaş gəlir"', () => {
    const leave = leaveTemplate(ctx, 'Ülkər');
    expect(leave.changes[0].kind).toBe('emp_remove');
    const scen = scenarioData(live, leave.changes);
    const left = scen.tasks.filter((x) => !x.is_cancelled && curOwner(x) === 'Ülkər').reduce((s, x) => s + x.hours, 0);
    const short = leave.result.shortfall.find((s) => s.name === 'Ülkər')?.hours ?? 0;
    expect(left).toBeCloseTo(short, 6);
    expect(scen.employees.find((e) => e.name === 'Ülkər')!.active).toBe(false);

    const hire = hireTemplate(ctx, { name: 'Yeni Mütəxəssis', company: 'Birbank', activity: 'Administrativ', fte: 1 });
    expect(hire.changes[0].kind).toBe('emp_add');
    const c = compare(live, scenarioData(live, hire.changes));
    expect(c.next.fteHave).toBeGreaterThan(c.cur.fteHave);
    expect(c.next.over.length).toBeLessThanOrEqual(c.cur.over.length);
  });

  it('müqayisə: dəyişən əməkdaşlar; tətbiq jurnalı', () => {
    const c1 = transferChange(ctx, [t.id], 'Aygül')!;
    const scen = scenarioData(live, [c1]);
    const cmp = compare(live, scen);
    expect(cmp.changed.map((p) => p.name).sort()).toEqual([curOwner(t), 'Aygül'].sort());
    const logs = applyLogs('Test', live, scen);
    expect(logs[0]).toMatchObject({ action: 'Ssenari' });
    expect(logs.find((l) => l.action === 'Ötürmə')).toMatchObject({ task_id: t.id, from: curOwner(t), to: 'Aygül' });
    expect(transferHours(live, [c1])).toBeCloseTo(t.hours, 6);
  });
});

describe('tətbiqdə ziddiyyət yoxlaması', () => {
  const t = live.tasks.find((x) => !x.is_cancelled && x.owner_before && !x.owner_after)!;
  const c = transferChange(ctx, [t.id], 'Aygül')!;

  it('canlı data dəyişməyibsə ziddiyyət yoxdur', () => {
    expect(findConflicts(live, [c])).toEqual([]);
  });
  it('eyni sahə başqası tərəfindən dəyişib → ziddiyyət (köhnə və yeni dəyər ilə)', () => {
    const moved = applyOpsTo(live, [{ t: 'upsert', table: 'Tasks', row: { id: t.id, owner_after: 'Ülkər' } }]);
    const cf = findConflicts(moved, [c]);
    expect(cf).toHaveLength(1);
    expect(cf[0]).toMatchObject({ key: t.id, reason: 'changed', fields: { owner_after: ['', 'Ülkər'] } });
  });
  it('fərqli sahə dəyişibsə ziddiyyət deyil', () => {
    const edited = applyOpsTo(live, [{ t: 'upsert', table: 'Tasks', row: { id: t.id, description: 'yeni təsvir' } }]);
    expect(findConflicts(edited, [c])).toEqual([]);
  });
  it('silinmiş sənəd və artıq mövcud yeni sənəd', () => {
    const gone = applyOpsTo(live, [{ t: 'delete', table: 'Tasks', key: t.id }]);
    expect(findConflicts(gone, [c])[0].reason).toBe('deleted');
    const add = addEmployeeChange(ctx, { name: 'Gələn', company: 'Birbank', activity: 'Administrativ', fte: 1 })!;
    const exists = applyOpsTo(live, [{ t: 'upsert', table: 'Employees', row: { name: 'Gələn' } }]);
    expect(findConflicts(exists, [add])[0].reason).toBe('exists');
    // withBase olmayan sənəd üçün base yaratmır
    expect('base' in withBase(live, add.ops)[0]).toBe(false);
  });
});
