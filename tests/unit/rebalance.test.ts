// §8 balanslama alqoritmi — SPEC QM: deterministik, qəbul edən θ−0,05-i keçmir, çatışmazlıq düzgün, ≤ 50 ms.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { rebalance, REBALANCE_BUFFER } from '../../shared/rebalance.js';
import { normalizeEmployee, normalizeTask, curOwner } from '../../shared/model.js';
import { computeMetrics } from '../../shared/metrics.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import { applyOpsLocal } from '../../shared/apply.js';
import { makeChange, rebalanceIn } from '../../shared/scenario.js';

const seed = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const input = () => ({
  tasks: seed.tasks.map(normalizeTask),
  employees: seed.employees.map(normalizeEmployee),
  settings: { ...DEFAULT_SETTINGS, vacation_days: 0 },
});

describe('rebalance — seed data', () => {
  it('deterministikdir (eyni giriş → eyni çıxış)', () => {
    const a = rebalance(input(), { threshold: 1 });
    const b = rebalance(input(), { threshold: 1 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.donors).toEqual(['Ülkər', 'Sveta x', 'Ağaəli']);
    expect(a.moves.length).toBeGreaterThan(0);
    expect(a.shortfalls).toEqual([]);
  });

  it.each([1, 0.85])('θ=%s: heç bir qəbul edən θ−0,05-i keçmir, donorlar ≤ θ', (θ) => {
    const inp = input();
    const r = rebalance(inp, { threshold: θ });
    for (const m of r.moves) expect(m.toAfter).toBeLessThanOrEqual(θ - REBALANCE_BUFFER + 1e-9);
    // Nəticə metrics ilə də yoxlanır (tək mənbə)
    const after = rebalanceIn({ tasks: inp.tasks, employees: inp.employees, settings: inp.settings }, r);
    const m = computeMetrics(after);
    const receivers = new Set(r.moves.map((x) => x.to));
    for (const l of m.people) {
      if (r.donors.includes(l.name) && !r.shortfalls.some((s) => s.name === l.name)) expect(l.load).toBeLessThanOrEqual(θ + 1e-9);
      if (receivers.has(l.name)) expect(l.load).toBeLessThanOrEqual(θ - REBALANCE_BUFFER + 1e-9);
    }
  });

  it('şirkətlərarası ötürmə yoxdur (default), kilidli iş toxunulmur', () => {
    const inp = input();
    const emp = new Map(inp.employees.map((e: { name: string; company: string }) => [e.name, e.company]));
    const r = rebalance(inp, { threshold: 0.85 });
    for (const m of r.moves) expect(emp.get(m.to)).toBe(m.company);
    const locked = r.moves.slice(0, 3).map((m) => m.taskId);
    const r2 = rebalance(inp, { threshold: 0.85, locked });
    expect(r2.moves.some((m) => locked.includes(m.taskId))).toBe(false);
  });

  it('341 iş ≤ 50 ms', () => {
    const inp = input();
    rebalance(inp); // isinmə
    const t0 = performance.now();
    rebalance(inp, { threshold: 0.85 });
    expect(performance.now() - t0).toBeLessThan(50);
  });

  it('nəticə ssenari dəyişikliyinə çevrilir (yalnız owner sahələri)', () => {
    const inp = input();
    const live = { tasks: inp.tasks, employees: inp.employees, settings: inp.settings };
    const r = rebalance(inp, { threshold: 1 });
    const ch = makeChange('rebalance', 'Balans', live, rebalanceIn(live, r))!;
    expect(ch.ops).toHaveLength(r.moves.length);
    const next = applyOpsLocal(live, ch.ops);
    for (const m of r.moves) expect(curOwner(next.tasks.find((t) => t.id === m.taskId)!)).toBe(m.to);
  });
});

describe('rebalance — çatışmazlıq', () => {
  it('qəbul edən yoxdursa qalıq saat = saat − θ × tutum', () => {
    const settings = { ...DEFAULT_SETTINGS, norm: 100, vacation_days: 0 };
    const tasks = [
      normalizeTask({ id: 'a', process: 'P', task: 'a', owner_before: 'Ali', hours: 90, company: 'Birbank' }),
      normalizeTask({ id: 'b', process: 'P', task: 'b', owner_before: 'Ali', hours: 60, company: 'Birbank' }),
      normalizeTask({ id: 'c', process: 'P', task: 'c', owner_before: 'Vali', hours: 50, company: 'Birbank' }),
    ];
    const employees = [normalizeEmployee({ name: 'Ali' }), normalizeEmployee({ name: 'Vali' })];
    const r = rebalance({ tasks, employees, settings }, { threshold: 1 });
    // Vali: 50/100; 60 alsa 110% > 95% → yox; 90 də yox → çatışmazlıq 150 − 100 = 50
    expect(r.moves).toEqual([]);
    expect(r.shortfalls).toEqual([{ name: 'Ali', hours: 50, load: 1.5 }]);
  });

  it('bərabərlikdə prosesi bilən, sonra ad üzrə seçilir', () => {
    const settings = { ...DEFAULT_SETTINGS, norm: 100, vacation_days: 0 };
    const tasks = [
      normalizeTask({ id: 'a', process: 'X', task: 'a', owner_before: 'Ali', hours: 120 }),
      normalizeTask({ id: 'b', process: 'X', task: 'b', owner_before: 'Zaur', hours: 10 }),
      normalizeTask({ id: 'c', process: 'Y', task: 'c', owner_before: 'Bəxtiyar', hours: 10 }),
      normalizeTask({ id: 'd', process: 'X', task: 'd', owner_before: 'Ali', hours: 30 }),
    ];
    const employees = ['Ali', 'Zaur', 'Bəxtiyar'].map((name) => normalizeEmployee({ name }));
    const r = rebalance({ tasks, employees, settings }, { threshold: 1 });
    // d (30 saat) ilk: Zaur və Bəxtiyar eyni "sonra" yükü (40%) → X prosesini bilən Zaur
    expect(r.moves[0]).toMatchObject({ taskId: 'd', to: 'Zaur' });
  });
});
