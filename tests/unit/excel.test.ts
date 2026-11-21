// Excel v2 (SPEC §9) və hesabat datası (§6.7) — saf funksiyalar.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  detectMapping,
  exportSheets,
  headerKey,
  importPlan,
  parseSheet,
  suggestRenames,
  toCsv,
  TASK_COLS,
} from '../../shared/excel.js';
import { commentary, employeeReport, executiveReport, filterLog, processReport, recentTransfers } from '../../shared/report.js';
import { normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { computeMetrics } from '../../shared/metrics.js';
import { staffTable } from '../../shared/dashboard.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import type { LogEntry } from '../../shared/schema.js';

const seed = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const live = () => ({
  tasks: seed.tasks.map(normalizeTask),
  employees: seed.employees.map(normalizeEmployee),
  settings: { ...DEFAULT_SETTINGS },
});
let n = 0;
const newId = () => `T-test${++n}`;

describe('sütun xəritəsi', () => {
  it('"İ" ilə başlayan başlıqlar tanınır (v1 bug-ının reqressiya testi)', () => {
    expect(headerKey('İllik saat')).toBe('illik saat');
    expect(headerKey('İLKİN İCRAÇI')).toBe(headerKey('ilkin icraçı'));
    expect(detectMapping(['İLKİN İCRAÇI', 'TAPŞIRIQ'])).toEqual(['owner_before', 'task']);
    expect(detectMapping(['İllik sərf olunan vaxt', 'İlkin icraçı', 'Tapşırıq'])).toEqual(['hours', 'owner_before', 'task']);
  });
  it('CONTEXT.md §2 mənbə başlıqları və v2 export başlıqları', () => {
    expect(detectMapping(['1 keys üçün dəqiqə sərfi', 'illik təkrarlanma', 'Optimizasiyadan sonra', 'Naməlum'])).toEqual([
      'min_per_key',
      'annual_freq',
      'after_opt',
      '',
    ]);
    const m = detectMapping(TASK_COLS.map(([, h]) => h));
    expect(m.filter(Boolean)).toHaveLength(17); // hesablanmış sütunlar (cari icraçı, status, son dəyişiklik) import olunmur
    expect(m[TASK_COLS.findIndex(([k]) => k === 'current')]).toBe('');
  });
});

describe('validasiya və diff önizləmə', () => {
  const head = [
    'id',
    'Proses',
    'Tapşırıq',
    'İlkin icraçı',
    'İllik saat',
    'Ləğv edilib',
    'İllik təkrarlanma',
    '1 əməliyyata dəqiqə',
  ];
  const map = detectMapping(head);

  it('xətalar sətir nömrəsi və səbəblə', () => {
    const rows = parseSheet(
      [
        head,
        ['B-25', 'P', 't', 'Ülvi', 'abc', '', '', ''],
        ['', '', '', '', '', '', '', ''],
        ['X/1', 'P', 't', 'A', 5, 'bəlkə', '', ''],
        ['B-25', 'P', 't', 'A', 1, '', '', ''],
      ],
      map,
    );
    expect(rows.map((r) => [r.row, r.errors.length > 0])).toEqual([
      [2, true],
      [4, true],
      [5, true],
    ]);
    expect(rows[0].errors[0]).toMatch(/rəqəm deyil/);
    expect(rows[1].errors.join()).toMatch(/"\/"/);
    expect(rows[2].errors.join()).toMatch(/təkrarlanır \(sətir 2\)/);
  });

  it('yenilə + əlavə et: yalnız dəyişən sahələr, yeni iş, yeni əməkdaş, xətalılar tətbiq olunmur', () => {
    const s = live();
    const b25 = s.tasks.find((t: { id: string }) => t.id === 'B-25')!;
    const b26 = s.tasks.find((t: { id: string }) => t.id === 'B-26')!;
    const rows = parseSheet(
      [
        head,
        ['B-25', b25.process, b25.task, b25.owner_before, 99, 'Xeyr', '', ''],
        ['B-26', b26.process, b26.task, b26.owner_before, b26.hours, b26.is_cancelled ? 'Bəli' : 'Xeyr', '', ''],
        ['', 'Yeni proses', 'Yeni iş', 'Yeni Şəxs', '', 'Xeyr', '24 say', 30],
        ['', 'Yox', 'Saatsız', 'A', '', '', '', ''],
      ],
      map,
    );
    const p = importPlan(s, rows, { newId });
    expect(p.changed).toEqual([
      { id: 'B-25', label: `${b25.process} — ${b25.task}`, fields: [{ field: 'hours', from: b25.hours, to: 99 }] },
    ]);
    expect(p.created).toHaveLength(1);
    expect(p.created[0]).toMatchObject({ task: 'Yeni iş', hours: 12, annual_freq: 24, unit: 'say', company: 'Birbank' });
    expect(p.newEmployees).toEqual(['Yeni Şəxs']);
    expect(p.errors).toEqual([{ row: 5, errors: [expect.stringMatching(/Saat boşdur/)] }]);
    expect(p.deleted).toEqual([]);
    expect(p.next.tasks).toHaveLength(342);
  });

  it('əvəz et: faylda olmayanlar silinir (yalnız siyahıda — yazma diffOps ilə, kolleksiya əvəz olunmur)', () => {
    const s = live();
    const rows = parseSheet([head, ['B-25', 'P', 't', 'Ülvi', 5, 'Xeyr', '', '']], map);
    const p = importPlan(s, rows, { mode: 'replace', newId });
    expect(p.deleted).toHaveLength(340);
    expect(p.next.tasks.map((t) => t.id)).toEqual(['B-25']);
  });
});

describe('ad uyğunlaşdırması və fəaliyyət forması', () => {
  const head = [
    'id',
    'Şirkət',
    'Fəaliyyət forması',
    'Proses',
    'Tapşırıq',
    'Əvvəlki icraçı',
    'Sonrakı icraçı',
    'İllik sərf olunan vaxt (saat)',
  ];
  const map = detectMapping(head);
  const s = live();
  const b1 = s.tasks.find((t: { id: string }) => t.id === 'B-1')!;
  const rows = parseSheet(
    [
      head,
      ['B-1', 'Birbank', 'Administrativ', b1.process, b1.task, 'Ağaəli Nümunəli', 'Zümrüd Birinci', b1.hours],
      ['B-2', 'Birbank', 'Administrativ', 'P', 't', 'Ağaəli Nümunəli', 'Zümrüd Birinci', 12],
      ['B-7', 'Birbank', 'Administrativ', 'P', 't', 'Ağaəli Nümunəli', 'Zümrüd İkinci', 62.67],
      ['B-15', 'Birbank', 'Administrativ', 'P', 't', 'Svetlana Nümunə', 'Fəridə Nümunə', 5],
      ['B-16', 'Birbank', 'Administrativ', 'P', 't', 'Kamila Nümunə', 'Mədinə Nümunə', 5],
      ['M-1', 'Birmarket', 'Project and AdHoc based', 'P', 't', 'Nümunəli Gülnar', '', 10],
      ['M-2', 'Birmarket', 'Administrativ', 'P', 't', 'Nümunəli Gülnar', '', 2],
    ],
    map,
  );

  it('fəaliyyət forması sütunu tanınır, amma tapşırığa yazılmır', () => {
    expect(map[2]).toBe('activity');
    const p = importPlan(s, rows, { newId });
    expect(p.created.find((t) => t.id === 'M-1')).not.toHaveProperty('activity');
  });

  it('qısa adlar tam adlara təklif olunur (dublikatlar birləşir, oxşar olmayanlar toxunulmur)', () => {
    const sg = suggestRenames(s.employees, rows);
    expect(sg).toMatchObject({
      Ağaəli: 'Ağaəli Nümunəli',
      Zümrüd: 'Zümrüd Birinci', // faylda daha çox keçən
      'Sveta x': 'Svetlana Nümunə',
      Farida: 'Fəridə Nümunə',
      Fəridə: 'Fəridə Nümunə',
      Kamila: 'Kamila Nümunə',
      Kamilə: 'Kamila Nümunə',
      Medina: 'Mədinə Nümunə',
    });
    for (const n of ['Aygül', 'Gülşən', 'Nərmin', 'Orxan', 'Aysel', 'Ülkər', 'Şöbə əməkdaşları']) expect(sg[n]).toBeUndefined();
  });

  it('ad dəyişmə profili saxlayır, tapşırıqlarda adı yeniləyir; yeni əməkdaşın fəaliyyəti fayldan', () => {
    const p = importPlan(s, rows, { newId, renames: suggestRenames(s.employees, rows) });
    const emp = (n: string) => p.next.employees.find((e) => e.name === n);
    expect(emp('Ağaəli')).toBeUndefined();
    expect(emp('Ağaəli Nümunəli')).toMatchObject({ activity: 'Project and AdHoc based', fte: 1 }); // köhnə profil
    expect(emp('Zümrüd İkinci')).toMatchObject({ activity: 'Administrativ' });
    expect(emp('Nümunəli Gülnar')).toMatchObject({ company: 'Birmarket', activity: 'Project and AdHoc based' }); // 10 > 2 saat
    expect(emp('Kamilə')).toBeUndefined();
    expect(p.renamed).toContainEqual({ from: 'Kamilə', to: 'Kamila Nümunə', merged: true });
    expect(p.newEmployees.sort((a, b) => a.localeCompare(b))).toEqual(['Nümunəli Gülnar', 'Zümrüd İkinci']);
    // faylda olmayan tapşırıqda da köhnə ad yenilənir
    const left = p.next.tasks.filter((t) => [t.owner_before, t.owner_after].some((n) => n === 'Ağaəli' || n === 'Hüseyn x'));
    expect(left).toEqual([]);
    expect(p.next.tasks.some((t) => t.id === 'B-3' && t.owner_before === 'Ağaəli Nümunəli')).toBe(true);
    // B-1: yalnız ad dəyişib → fayl ilə fərq yoxdur
    expect(p.changed.find((c) => c.id === 'B-1')).toBeUndefined();
  });
});

describe('export vərəqləri', () => {
  it('v1 4 vərəqi + Hesabat (effektiv norma izahı ilə), CSV', () => {
    const s = live();
    const m = computeMetrics(s);
    const sheets = exportSheets({
      state: s,
      m,
      staff: staffTable(s, m, []),
      log: [],
      user: 'Ecosystem',
      filtersLabel: 'Bütün',
      activityOf: () => 'Administrativ',
    });
    expect(sheets.map((x) => x.name)).toEqual(['Hesabat', 'Tapşırıqlar', 'Əməkdaşlar', 'Yük analizi', 'Jurnal']);
    expect(sheets[1].rows).toHaveLength(342);
    const rep = Object.fromEntries(sheets[0].rows.map((r) => [r[0], r[1]]));
    expect(rep['Effektiv norma (saat/ştat)']).toBe(1682);
    expect(rep['Lazım olan ştat (FTE)']).toBe(16.56);
    expect(
      toCsv([
        ['a;b', 1.5],
        ['"x"', ''],
      ]),
    ).toBe('﻿"a;b";1,5\r\n"""x""";');
  });
});

describe('hesabat datası', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  const log: LogEntry[] = [
    { id: '1', ts: '2026-11-10T10:00:00Z', action: 'Ötürmə', task_id: 'B-25', from: 'Ülvi', to: 'Zümrüd', user: 'Ecosystem' },
    { id: '2', ts: '2026-09-01T10:00:00Z', action: 'Ötürmə', task_id: 'B-26', from: 'Ülvi', to: 'Zümrüd', user: 'Aysel' },
    { id: '3', ts: '2026-11-11T10:00:00Z', action: 'Ləğv', task_id: 'B-27', user: 'Aysel' },
  ];
  it('avtomatik şərh — 3 cümlə, effektiv norma ilə', () => {
    const s = live();
    const m = computeMetrics(s);
    const tr = recentTransfers(s.tasks, log, 30, now);
    expect(tr.count).toBe(1);
    const c = commentary(m, tr);
    expect(c).toHaveLength(3);
    expect(c[0]).toBe(
      'Şöbədə 16,6 FTE iş var, 18,0 ştat mövcuddur (+1,4 ehtiyat). Hesablama effektiv norma ilə aparılır: 1 922 − 240 saat məzuniyyət = 1 682 saat/ştat.',
    );
    expect(c[1]).toBe('7 əməkdaş normanı aşır: Ülkər (129%), Sveta x (129%), Ağaəli (121%) və daha 4 nəfər.');
    expect(c[2]).toMatch(/^Son 30 gündə 1 iş ötürülüb/);
  });
  it('rəhbərlik, proses, əməkdaş, jurnal', () => {
    const s = live();
    const r = executiveReport(s, log, {}, now);
    expect(r.risks.over).toHaveLength(7);
    expect(r.risks.health.find((h) => h.kind === 'name_dup')?.n).toBe(2);
    const p = processReport(s, 'İntizam tənbehi');
    expect(p.owners[0].name).toBe('İlahə');
    expect(p.norm).toBe(1682);
    const e = employeeReport(s, log, 'Ülkər');
    expect(e.load?.cap).toBe(1682);
    expect(e.tasks.every((x) => x.mine || x.t.owner_before === 'Ülkər')).toBe(true);
    expect(filterLog(log, { from: '2026-11-01', user: 'Aysel' }).map((l) => l.id)).toEqual(['3']);
  });
});
