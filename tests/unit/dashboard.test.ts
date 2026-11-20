// Panel datası (SPEC §6.2) — seed üzərində, qızıl rəqəmlərlə uyğunluq.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { computeMetrics } from '../../shared/metrics.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import {
  capacityBalance,
  companyActivityMatrix,
  loadBars,
  loadHeatmap,
  loadHistogram,
  pareto,
  staffTable,
  transferFlows,
  waterfall,
  workTree,
} from '../../shared/dashboard.js';

const raw = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const input = {
  tasks: raw.tasks.map(normalizeTask),
  employees: raw.employees.map(normalizeEmployee),
  settings: { ...DEFAULT_SETTINGS },
  year: 2026,
};
const m = computeMetrics(input);
const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('Panel datası', () => {
  it('tutum balansı: lazım 14,49 · mövcud 18 · opt. sonra lazım', () => {
    const b = capacityBalance(input);
    expect(r(b.need)).toBe(14.49);
    expect(r(b.have)).toBe(18);
    expect(r(b.needOpt)).toBe(r(27794.56 / 1922));
  });

  it('yük barları: qruplar xaric, azalan; ilk üçü normanı aşanlardır', () => {
    const bars = loadBars(m);
    expect(bars.every((b) => !b.isGroup)).toBe(true);
    expect(
      bars
        .slice(0, 3)
        .map((b) => b.name)
        .sort(),
    ).toEqual(['Ağaəli', 'Sveta x', 'Ülkər'].sort());
    expect(loadBars(m, { groups: true }).some((b) => b.isGroup)).toBe(true);
  });

  it('Sankey: axınların cəmi = transfer sayı və saatı', () => {
    const f = transferFlows(input);
    expect(sum(f.map((x) => x.count))).toBe(121);
    expect(r(sum(f.map((x) => x.hours)))).toBe(r(m.transfers.hours));
    expect(f.every((x) => x.from !== x.to)).toBe(true);
  });

  it('treemap: cəm = aktiv iş həcmi; şirkətlər Birbank 21 014 · Pashapay 6 836', () => {
    const t = workTree(input);
    expect(r(sum(t.map((x) => x.value)))).toBe(27849.56);
    expect(Object.fromEntries(t.map((x) => [x.name, Math.round(x.value)]))).toEqual({ Birbank: 21014, Pashapay: 6836 });
    expect(t[0].children![0].children![0].children![0].id).toBeTruthy();
  });

  it('heatmap: 15 proses + Qalan proseslər, xanaların cəmi = fərdi + qrup saatları', () => {
    const h = loadHeatmap(input, m);
    expect(h.cols).toHaveLength(16);
    expect(h.cols.at(-1)).toBe('Qalan proseslər');
    expect(new Set(h.cols).size).toBe(h.cols.length); // təkrar sütun adı yoxdur
    const known = sum(loadBars(m).map((b) => b.hours));
    expect(r(sum(h.cells.map((c) => c[2])))).toBe(r(known));
  });

  it('waterfall: 28 782,14 − 932,58 − 0 = 27 849,56 − 55 = 27 794,56', () => {
    const w = Object.fromEntries(waterfall(input).map((s) => [s.key, r(s.value)]));
    expect(w).toEqual({ all: 28782.14, cancelled: 932.58, realized: 0, current: 27849.56, potential: 55, target: 27794.56 });
  });

  it('Pareto: kumulyativ 100%-ə çatır, 80% həddi', () => {
    const p = pareto(m, input);
    expect(r(p.items.at(-1)!.cumPct, 6)).toBe(1);
    expect(p.n80).toBeGreaterThan(0);
    expect(p.items[p.n80 - 1].cumPct).toBeGreaterThanOrEqual(0.8);
    if (p.n80 > 1) expect(p.items[p.n80 - 2].cumPct).toBeLessThan(0.8);
  });

  it('histogram: hər nəfər bir dəfə; 3 nəfər ≥ 100%', () => {
    const h = loadHistogram(m);
    expect(sum(h.bins.map((b) => b.names.length))).toBe(18);
    expect(sum(h.bins.filter((b) => b.from >= 1 - 1e-9).map((b) => b.names.length))).toBe(3);
    expect(h.median).toBeGreaterThan(0);
  });

  it('şirkət × fəaliyyət matrisi cəmi = ümumi', () => {
    const cells = companyActivityMatrix(input);
    expect(cells).toHaveLength(4);
    expect(r(sum(cells.map((c) => c.hours)))).toBe(27849.56);
    expect(sum(cells.map((c) => c.tasks))).toBe(330);
  });

  it('ştat cədvəli: son 30 gün ötürmələri jurnaldan', () => {
    const now = Date.parse('2026-11-20T00:00:00Z');
    const log = [
      { id: '1', ts: '2026-11-19T10:00:00Z', action: 'Ötürmə', task_id: 'B-25', from: 'Ülvi', to: 'Zümrüd' },
      { id: '2', ts: '2026-01-01T10:00:00Z', action: 'Ötürmə', task_id: 'B-1', from: 'Ağaəli', to: 'Zümrüd' },
    ];
    const rows = staffTable(input, m, log, { now });
    const h25 = input.tasks.find((t: { id: string }) => t.id === 'B-25').hours;
    expect(rows.find((x) => x.name === 'Zümrüd')!.received30).toBe(h25);
    expect(rows.find((x) => x.name === 'Ülvi')!.given30).toBe(h25);
    expect(rows.find((x) => x.name === 'Ağaəli')!.given30).toBe(0);
    expect(rows.some((x) => x.singleProcesses > 0)).toBe(true);
  });

  it('filtr bütün vidjetlərə tətbiq olunur', () => {
    const f = { company: 'Pashapay' };
    expect(r(sum(workTree(input, { filters: f }).map((x) => x.value)), 0)).toBe(6836);
    expect(waterfall(input, f).every((s) => s.value <= 7000)).toBe(true);
  });
});
