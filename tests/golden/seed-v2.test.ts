// Qızıl rəqəmlər (SPEC §13.2) — shared/metrics.ts (v2) ilə. HEÇ VAXT silinmir.
// Həm də v1 etalonu ilə müqayisə: eyni datada eyni nəticə — miqrasiyanın əsas yoxlaması (SPEC §0.3).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACT_ADMIN, ACT_PROJECT, DEFAULT_SETTINGS } from '../../shared/schema.js';
import { normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { computeMetrics } from '../../shared/metrics.js';
import { fmtFte, fmtHours, fmtPct } from '../../shared/format.js';
import { computeV1, normalize } from './v1-metrics.js';

const raw = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const input = {
  tasks: raw.tasks.map(normalizeTask),
  employees: raw.employees.map(normalizeEmployee),
  // Köhnə qayda (məzuniyyətsiz, 1922) — v1 formulası ilə uyğunluq yoxlanır; 30 günlük qayda: seed-vacation.test.ts
  settings: { ...DEFAULT_SETTINGS, vacation_days: 0 },
  year: 2026,
};
const m = computeMetrics(input);
const r = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

describe('qızıl rəqəmlər — shared/metrics.ts', () => {
  it('aktiv tapşırıq 330, iş həcmi 27 849,56', () => {
    expect(m.activeTasks).toBe(330);
    expect(r(m.totalHours, 2)).toBe(27849.56);
  });
  it('lazım 14,49 FTE, mövcud 18,0 FTE (18 nəfər), ehtiyat +3,5', () => {
    expect(r(m.fteNeed, 2)).toBe(14.49);
    expect(r(m.fteHave, 2)).toBe(18);
    expect(m.people).toHaveLength(18);
    expect(r(m.gap, 1)).toBe(3.5);
  });
  it('norması aşanlar: Ülkər 113%, Sveta x 113%, Ağaəli 106%', () => {
    expect(Object.fromEntries(m.over.map((o) => [o.name, r(o.load * 100)]))).toEqual({ Ülkər: 113, 'Sveta x': 113, Ağaəli: 106 });
    expect(m.over.every((o) => o.level === 'critical')).toBe(true);
  });
  it('ləğvdən qənaət 932,58 (11), transfer 121, optimizasiya 55', () => {
    expect(r(m.cancelled.hours, 2)).toBe(932.58);
    expect(m.cancelled.count).toBe(11);
    expect(m.transfers.count).toBe(121);
    expect(r(m.optPotential, 2)).toBe(55);
  });
  it('şirkət və fəaliyyət forması bölgüsü', () => {
    expect(r(m.byCompany.Birbank)).toBe(21014);
    expect(r(m.byCompany.Pashapay)).toBe(6836);
    expect(r(m.byActivity[ACT_ADMIN])).toBe(23899);
    expect(r(m.byActivity[ACT_PROJECT])).toBe(3951);
  });
  it('filtrlər bölgü ilə uyğundur', () => {
    expect(r(computeMetrics(input, { filters: { company: 'Birbank' } }).totalHours)).toBe(21014);
    expect(r(computeMetrics(input, { filters: { activity: ACT_PROJECT } }).totalHours)).toBe(3951);
  });
  it('ekran formatı', () => {
    expect(fmtHours(m.totalHours)).toBe('27 850');
    expect(fmtFte(m.fteNeed)).toBe('14,5');
    expect(fmtFte(m.fteHave)).toBe('18,0');
    expect(fmtHours(m.cancelled.hours)).toBe('933');
    expect(fmtPct(m.over[0].load)).toBe('113%');
  });
});

describe('v2 = v1 (seed datasında)', () => {
  const v1State = normalize(raw);
  for (const view of ['current', 'opt'] as const)
    for (const filters of [
      {},
      { company: 'Birbank' },
      { company: 'Pashapay' },
      { activity: ACT_ADMIN },
      { activity: ACT_PROJECT },
    ])
      it(`${view} ${JSON.stringify(filters)}`, () => {
        const a = computeMetrics(input, { view, filters });
        const b = computeV1(v1State, { ...filters, useOpt: view === 'opt' });
        expect(r(a.totalHours, 6)).toBe(r(b.totalH, 6));
        expect(r(a.fteHave, 6)).toBe(r(b.fteHave, 6));
        expect(a.over.map((o) => o.name)).toEqual(b.over.map((o) => o.name));
        expect(r(a.cancelled.hours, 6)).toBe(r(b.cancelledH, 6));
        expect(a.transfers.count).toBe(b.transfers);
        expect(r(a.optPotential, 6)).toBe(r(b.optSave, 6));
        const la = Object.fromEntries(a.loads.map((x) => [x.name, r(x.load, 9)]));
        const lb = Object.fromEntries(b.loads.map((x) => [x.name, r(x.load, 9)]));
        expect(la).toEqual(lb);
      });
});
