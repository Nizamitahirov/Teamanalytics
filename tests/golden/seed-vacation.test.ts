// Qızıl rəqəmlər — məzuniyyət qaydası ilə (sahibin qərarı, ADR-008): effektiv norma = 1922 − 30 gün × 8 = 1682 saat/ştat.
// Köhnə (məzuniyyətsiz) rəqəmlər seed-v2.test.ts-də `vacation_days: 0` ilə qalır. HEÇ VAXT silinmir.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import { normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { computeMetrics, effectiveNorm, vacationHours } from '../../shared/metrics.js';
import { fmtFte } from '../../shared/format.js';

const raw = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const input = {
  tasks: raw.tasks.map(normalizeTask),
  employees: raw.employees.map(normalizeEmployee),
  settings: { ...DEFAULT_SETTINGS },
};

describe('məzuniyyət qaydası (default 30 gün)', () => {
  it('effektiv norma 1682 = 1922 − 240', () => {
    expect(vacationHours(DEFAULT_SETTINGS)).toBe(240);
    expect(effectiveNorm(DEFAULT_SETTINGS)).toBe(1682);
    expect(effectiveNorm({ norm: 1922, vacation_days: 0 })).toBe(1922);
    expect(effectiveNorm({ norm: 1922 })).toBe(1682); // sahə yoxdursa default 30
  });

  const m = computeMetrics(input);
  it('lazım 16,56 FTE, mövcud 18,0, ehtiyat +1,4', () => {
    expect(m.norm).toBe(1682);
    expect(m.normGross).toBe(1922);
    expect(m.vacationHours).toBe(240);
    expect(fmtFte(m.fteNeed, 2)).toBe('16,56');
    expect(m.fteHave).toBe(18);
    expect(fmtFte(m.gap, 1)).toBe('1,4');
  });

  it('norması aşanlar: 7 nəfər', () => {
    expect(m.over.map((o) => [o.name, Math.round(o.load * 100)])).toEqual([
      ['Ülkər', 129],
      ['Sveta x', 129],
      ['Ağaəli', 121],
      ['Aysel', 114],
      ['Hüseyn', 112],
      ['İlahə', 110],
      ['Medina', 101],
    ]);
  });

  it('iş həcmi dəyişmir (məzuniyyət yalnız tutuma təsir edir)', () => {
    expect(Math.round(m.totalHours)).toBe(27850);
    expect(m.people.find((p) => p.name === 'Ülkər')!.cap).toBe(1682);
  });
});
