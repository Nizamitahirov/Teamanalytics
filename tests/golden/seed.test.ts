// Qızıl rəqəmlər (SPEC §13.2) — data/seed.json üzərində. Bu test HEÇ VAXT silinmir.
// Mərhələ 1: v1 formulalarının TS köçürməsinə qarşı (./v1-metrics.ts).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ACT_ADMIN, ACT_PROJECT, EmployeeSchema, TaskSchema } from '../../shared/schema.js';
import { computeV1, normalize, statusOf } from './v1-metrics.js';

const raw = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const state = normalize(raw);
const m = computeV1(state);
const round = (n: number, d = 0) => Math.round(n * 10 ** d) / 10 ** d;

describe('seed datası', () => {
  it('tapşırıq və əməkdaş sayları', () => {
    expect(state.tasks).toHaveLength(341);
    expect(state.tasks.filter((t) => t.company === 'Birbank')).toHaveLength(266);
    expect(state.tasks.filter((t) => t.company === 'Pashapay')).toHaveLength(75);
    expect(state.employees).toHaveLength(23);
  });

  it('hər sətir v2 Zod sxemlərinə uyğundur', () => {
    for (const t of raw.tasks) expect(TaskSchema.safeParse(t).success, `task ${t.id}`).toBe(true);
    for (const e of raw.employees) expect(EmployeeSchema.safeParse(e).success, `employee ${e.name}`).toBe(true);
  });

  it('bütün tapşırıqların saatı 28 782,14', () => {
    expect(
      round(
        state.tasks.reduce((s, t) => s + t.hours, 0),
        2,
      ),
    ).toBe(28782.14);
  });
});

describe('qızıl rəqəmlər — v1 formulaları', () => {
  it('aktiv tapşırıq 330', () => expect(m.activeCount).toBe(330));

  it('illik iş həcmi 27 849,56 saat (ekranda 27 850)', () => {
    expect(round(m.totalH, 2)).toBe(27849.56);
    expect(round(m.totalH)).toBe(27850);
  });

  it('lazım olan FTE 14,49 (ekranda 14,5)', () => {
    expect(round(m.fteNeed, 2)).toBe(14.49);
    expect(round(m.fteNeed, 1)).toBe(14.5);
  });

  it('mövcud FTE 18,0 (18 nəfər)', () => {
    expect(round(m.fteHave, 2)).toBe(18);
    expect(m.peopleCount).toBe(18);
  });

  it('norması aşanlar: Ülkər ≈113%, Sveta x ≈113%, Ağaəli ≈106%', () => {
    const over = Object.fromEntries(m.over.map((r) => [r.name, round(r.load * 100)]));
    expect(Object.keys(over).sort()).toEqual(['Ağaəli', 'Sveta x', 'Ülkər'].sort());
    expect(over['Ülkər']).toBe(113);
    expect(over['Sveta x']).toBe(113);
    expect(over['Ağaəli']).toBe(106);
  });

  it('ləğvdən qənaət 932,58 saat, 11 iş', () => {
    expect(round(m.cancelledH, 2)).toBe(932.58);
    expect(round(m.cancelledH)).toBe(933);
    expect(m.cancelledCount).toBe(11);
  });

  it('transfer (aktiv) 121', () => {
    expect(m.transfers).toBe(121);
    expect(state.tasks.filter((t) => statusOf(t) === 'Transfer')).toHaveLength(121);
  });

  it('optimizasiya potensialı 55 saat', () => expect(round(m.optSave, 2)).toBe(55));

  it('şirkət bölgüsü: Birbank 21 014 · Pashapay 6 836', () => {
    expect(round(computeV1(state, { company: 'Birbank' }).totalH)).toBe(21014);
    expect(round(computeV1(state, { company: 'Pashapay' }).totalH)).toBe(6836);
  });

  it('fəaliyyət forması: Administrativ 23 899 · Project and AdHoc 3 951', () => {
    expect(round(computeV1(state, { activity: ACT_ADMIN }).totalH)).toBe(23899);
    expect(round(computeV1(state, { activity: ACT_PROJECT }).totalH)).toBe(3951);
  });

  it('"Optimizasiyadan sonra" görünüşü potensial qədər azaldır', () => {
    const opt = computeV1(state, { useOpt: true });
    expect(round(m.totalH - opt.totalH, 2)).toBe(round(m.optSave, 2));
  });
});
