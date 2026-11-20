// Data sağlamlığı (SPEC §6.8) və optimizasiya portfeli (§6.6) — saf funksiyalar. QM: seed tapıntıları aşkarlanır.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addIgnore, checkHealth, levenshtein, nameKey, nameKeyA } from '../../shared/health.js';
import { normalizeEmployee, normalizeTask, type TaskDoc } from '../../shared/model.js';
import { computeMetrics, realizedSaving } from '../../shared/metrics.js';
import { isGoodCandidate, nextQuarters, portfolio } from '../../shared/optimization.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';

const seed = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const state = () => ({ tasks: seed.tasks.map(normalizeTask) as TaskDoc[], employees: seed.employees.map(normalizeEmployee) });

describe('checkHealth — seed', () => {
  const f = checkHealth(state());
  const keys = f.map((x) => x.key);

  it('docs/CONTEXT.md §2 tapıntıları aşkarlanır', () => {
    expect(keys).toContain('name_dup:Farida|Fəridə');
    expect(keys).toContain('name_dup:Kamila|Kamilə');
    expect(keys).toContain('task_dup:B-1770271295121|B-44');
    expect(keys).toContain('hours_mismatch:P-29');
    const bad = f.find((x) => x.key === 'bad_id:P-x71')!;
    expect(bad.data).toMatchObject({ twin: 'P-71', reason: 'id' });
  });

  it('təkrar tapşırıqda aktiv/ilkin id saxlanılır', () => {
    expect(f.find((x) => x.key === 'task_dup:B-1770271295121|B-44')!.data).toMatchObject({
      keep: 'B-44',
      extra: 'B-1770271295121',
    });
  });

  it('başqa yalançı ad dublikatı yoxdur', () => {
    expect(f.filter((x) => x.kind === 'name_dup')).toHaveLength(2);
  });

  it('"Fərqlidir/Saxla" — health_ignore açarı tapıntını gizlədir', () => {
    const s = state();
    const e = s.employees.find((x: { name: string }) => x.name === 'Farida')!;
    e.health_ignore = addIgnore(e.health_ignore, 'name_dup:Farida|Fəridə');
    const t = s.tasks.find((x) => x.id === 'P-29')!;
    t.health_ignore = addIgnore(t.health_ignore, 'hours_mismatch:P-29');
    const k2 = checkHealth(s).map((x) => x.key);
    expect(k2).not.toContain('name_dup:Farida|Fəridə');
    expect(k2).not.toContain('hours_mismatch:P-29');
    expect(k2).toContain('name_dup:Kamila|Kamilə');
  });

  it('sahibsiz, aktiv olmayan və tutumsuz əməkdaş', () => {
    const s = state();
    s.tasks.find((x) => x.id === 'B-25')!.owner_after = 'Naməlum';
    s.employees.find((x: { name: string }) => x.name === 'Ülvi')!.active = false;
    s.employees.find((x: { name: string }) => x.name === 'Zümrüd')!.fte = 0;
    const k = checkHealth(s).map((x) => x.key);
    expect(k).toEqual(expect.arrayContaining(['orphan:Naməlum', 'departed:Ülvi', 'no_capacity:Zümrüd']));
  });

  it('köməkçilər', () => {
    expect(levenshtein('kamila', 'kamile')).toBe(1);
    expect(nameKey('Fəridə')).toBe('feride');
    expect(nameKeyA('Fəridə')).toBe('farida');
    expect(addIgnore('a', 'b')).toBe('a,b');
    expect(addIgnore('a,b', 'a')).toBe('a,b');
  });
});

describe('optimizasiya', () => {
  const t = (o: Record<string, unknown>) => normalizeTask({ id: 'X', process: 'P', task: 't', owner_before: 'Ali', ...o });

  it('miqrasiya qaydası: after_opt varsa namizəd', () => {
    expect(t({ hours: 10, after_opt: 4 }).automation).toBe('candidate');
    expect(t({ hours: 10 }).automation).toBe('none');
    expect(t({ hours: 10, after_opt: 4, automation: 'in_progress' }).automation).toBe('in_progress');
  });

  it('realizə olunmuş qənaət: əvəz olunubsa opt_before − hours, yoxsa hours − after_opt', () => {
    expect(realizedSaving(t({ hours: 4, after_opt: 4, opt_before: 10 }))).toBe(6);
    expect(realizedSaving(t({ hours: 10, after_opt: 4 }))).toBe(6);
    const m = computeMetrics({
      tasks: [
        t({ id: 'a', hours: 4, after_opt: 4, opt_before: 10, automation: 'done' }),
        t({ id: 'b', hours: 10, after_opt: 7 }),
      ],
      employees: [],
      settings: { ...DEFAULT_SETTINGS },
    });
    expect(m.optRealized).toBe(6);
    expect(m.optPotential).toBe(3); // done çıxılır (§7.8)
  });

  it('portfel: sütunlar, rüblər üzrə plan vs fakt, yaxşı namizəd', () => {
    const p = portfolio([
      t({ id: 'a', hours: 10, after_opt: 4, automation: 'candidate', due_quarter: '2027-Q1' }),
      t({ id: 'b', hours: 4, after_opt: 4, opt_before: 10, automation: 'done', due_quarter: '2027-Q1' }),
      t({ id: 'c', hours: 8, after_opt: 2, automation: 'in_progress' }),
      t({ id: 'd', hours: 8, after_opt: 2, automation: 'rejected', due_quarter: '2027-Q1' }),
      t({ id: 'e', hours: 8, after_opt: 2, is_cancelled: true }),
    ]);
    expect(Object.fromEntries(Object.entries(p.columns).map(([k, v]) => [k, v.map((x) => x.id)]))).toEqual({
      candidate: ['a'],
      in_progress: ['c'],
      done: ['b'],
      rejected: ['d'],
    });
    expect(p.quarters).toEqual([{ quarter: '2027-Q1', plan: 12, fact: 6 }]);
    expect(p.inProgress).toEqual({ count: 1, hours: 6 });
    expect(isGoodCandidate(t({ hours: 10, after_opt: 2, annual_freq: 600, min_per_key: 5 }))).toBe(true);
    expect(isGoodCandidate(t({ hours: 10, after_opt: 2, annual_freq: 600, min_per_key: 15 }))).toBe(false);
    expect(nextQuarters(new Date('2026-11-20T00:00:00Z'), 3)).toEqual(['2026-Q4', '2027-Q1', '2027-Q2']);
  });

  it('seed: rəhbərlik rəqəmləri dəyişmir (potensial §7.8 qızıl test ilə eyni)', () => {
    const s = state();
    const m = computeMetrics({ ...s, settings: { ...DEFAULT_SETTINGS } });
    expect(m.optRealized).toBe(0);
    expect(portfolio(s.tasks).columns.candidate).toHaveLength(2);
  });
});

describe('waterfall körpüsü (realizə olunmuş optimizasiya)', () => {
  it('hamısı − ləğv − realizə = cari', async () => {
    const { waterfall } = await import('../../shared/dashboard.js');
    const t = (o: Record<string, unknown>) => normalizeTask({ process: 'P', task: 't', owner_before: 'Ali', ...o });
    const steps = waterfall({
      tasks: [
        t({ id: 'a', hours: 4, after_opt: 4, opt_before: 10, automation: 'done' }),
        t({ id: 'b', hours: 20 }),
        t({ id: 'c', hours: 5, is_cancelled: true }),
      ],
      employees: [],
      settings: { ...DEFAULT_SETTINGS },
    });
    const v = Object.fromEntries(steps.map((x) => [x.key, x.value]));
    expect(v).toMatchObject({ all: 35, cancelled: 5, realized: 6, current: 24 });
    expect(v.all - v.cancelled - v.realized).toBe(v.current);
  });
});
