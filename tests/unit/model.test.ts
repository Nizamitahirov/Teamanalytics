import { describe, expect, it } from 'vitest';
import { diffOps, normalizeTask, statusOf, type DataState } from '../../shared/model.js';
import { resolveVersions, type Doc } from '../../server/firestore.js';
import { formatNumber, fmtFte, fmtHours, fmtPct, fmtSigned } from '../../shared/format.js';
import { levelOf } from '../../shared/metrics.js';
import { DEFAULT_SETTINGS, type Op } from '../../shared/schema.js';

const t = (o: Record<string, unknown>) =>
  normalizeTask({ id: 'B-1', process: 'P', task: 'T', owner_before: 'A', hours: 10, _v: 3, ...o });
const st = (tasks = [t({})]): Omit<DataState, 'log'> => ({ tasks, employees: [], settings: { ...DEFAULT_SETTINGS } });

describe('diffOps', () => {
  it('yalnız dəyişən sahələr + v + base', () => {
    const ops = diffOps(st(), st([t({ owner_after: 'B', updated_at: 'x' })]));
    expect(ops).toEqual([
      { t: 'upsert', table: 'Tasks', row: { id: 'B-1', owner_after: 'B', updated_at: 'x' }, base: { owner_after: '' }, v: 3 },
    ]);
  });
  it('yeni tapşırıq: tam sətir, v=0; silmə: v ilə', () => {
    const ops = diffOps(st([]), st([t({ id: 'T-1', _v: 0 })]));
    expect(ops[0]).toMatchObject({ t: 'upsert', v: 0, base: {} });
    expect(Object.keys((ops[0] as { row: object }).row)).toContain('hours');
    expect(diffOps(st(), st([]))).toEqual([{ t: 'delete', table: 'Tasks', key: 'B-1', v: 3 }]);
  });
  it('dəyişiklik yoxdursa boş; _v fərqi diff deyil', () => {
    expect(diffOps(st(), st([t({ _v: 9 })]))).toEqual([]);
  });
  it('ayarlar', () => {
    const cur = { ...st(), settings: { norm: 2000, warn: 85 } };
    expect(diffOps(st(), cur)).toEqual([{ t: 'upsert', table: 'Settings', row: { key: 'norm', value: 2000 } }]);
  });
  it('status', () => {
    expect(statusOf(t({ owner_after: 'B' }))).toBe('Transfer');
    expect(statusOf(t({ owner_before: '', owner_after: 'B' }))).toBe('Yeni');
    expect(statusOf(t({ is_cancelled: true }))).toBe('Ləğv');
    expect(statusOf(t({ owner_after: 'A' }))).toBe('Mövcud');
  });
});

describe('resolveVersions', () => {
  const cur = (o: Record<string, unknown> | null) =>
    new Map<string, Doc | null>([
      ['Tasks/B-1', o ? ({ _id: 'B-1', id: 'B-1', owner_after: 'A', hours: 10, _v: 3, ...o } as Doc) : null],
    ]);
  const up = (v: number, row: Record<string, unknown> = { owner_after: 'B' }, base?: Record<string, unknown>): Op =>
    ({ t: 'upsert', table: 'Tasks', row: { id: 'B-1', ...row }, v, ...(base ? { base } : {}) }) as Op;

  it('eyni versiya → qəbul, yeni versiya v+1', () => {
    const r = resolveVersions([up(3)], cur({}));
    expect(r.conflicts).toEqual([]);
    expect(r.versions).toEqual({ 'Tasks/B-1': 4 });
  });
  it('köhnə versiya, eyni sahə dəyişib → ziddiyyət, jurnal qeydi atılır', () => {
    const log: Op = { t: 'log', row: { task_id: 'B-1', action: 'X' } };
    const other: Op = { t: 'log', row: { task_id: 'B-2', action: 'Y' } };
    const r = resolveVersions([up(2, { owner_after: 'B' }, { owner_after: 'Z' }), log, other], cur({ updated_by: 'Aysel' }));
    expect(r.conflicts).toEqual([
      { table: 'Tasks', key: 'B-1', v: 3, by: 'Aysel', theirs: { id: 'B-1', owner_after: 'A', hours: 10, updated_by: 'Aysel' } },
    ]);
    expect(r.accepted).toEqual([other]);
  });
  it('köhnə versiya, fərqli sahə → birləşdirmə', () => {
    const r = resolveVersions([up(2, { hours: 5 }, { hours: 10 })], cur({}));
    expect(r.conflicts).toEqual([]);
    expect(r.versions['Tasks/B-1']).toBe(4);
  });
  it('base-də "" və null eynidir', () => {
    expect(resolveVersions([up(2, { owner_after: 'B' }, { owner_after: '' })], cur({ owner_after: null })).conflicts).toEqual([]);
  });
  it('yeni sənəd v=0; silinmiş sənədə yazma → ziddiyyət', () => {
    expect(resolveVersions([up(0)], cur(null)).conflicts).toEqual([]);
    expect(resolveVersions([up(3, { hours: 1 }, { hours: 10 })], cur({ _deleted: true, _v: 4 })).conflicts[0].theirs).toBeNull();
  });
  it('eyni partiyada ardıcıl iki op zəncirlənir', () => {
    const r = resolveVersions([up(3, { hours: 1 }), up(4, { hours: 2 })], cur({}));
    expect(r.conflicts).toEqual([]);
    expect(r.versions['Tasks/B-1']).toBe(5);
  });
  it('v-siz (v1) op yoxlanmır', () => {
    const op: Op = { t: 'upsert', table: 'Tasks', row: { id: 'B-1', hours: 1 } };
    expect(resolveVersions([op], cur({})).accepted).toEqual([op]);
  });
});

describe('format (SPEC §7.12)', () => {
  it.each([
    [27849.56, 0, '27 850'],
    [1234567.891, 2, '1 234 567,89'],
    [-3.45, 1, '−3,5'],
    [-0.01, 1, '0,0'],
    [0, 0, '0'],
  ])('%d (%d) → %s', (n, d, s) => expect(formatNumber(n, d)).toBe(s));
  it('köməkçilər', () => {
    expect(fmtHours(932.58)).toBe('933');
    expect(fmtHours(55.25)).toBe('55,3');
    expect(fmtHours(55)).toBe('55');
    expect(fmtFte(14.49)).toBe('14,5');
    expect(fmtFte(14.494, 2)).toBe('14,49');
    expect(fmtPct(1.1296)).toBe('113%');
    expect(fmtSigned(3.51)).toBe('+3,5');
    expect(formatNumber(Infinity)).toBe('∞');
  });
  it('yük səviyyəsi', () => {
    expect(levelOf(1.01, 85)).toBe('critical');
    expect(levelOf(0.9, 85)).toBe('warning');
    expect(levelOf(0.85, 85)).toBe('good');
    expect(levelOf(0, 85)).toBe('idle');
  });
});
