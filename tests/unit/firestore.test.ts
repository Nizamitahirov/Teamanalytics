// buildWrites — op → Firestore yazısı çevrilməsi (saf funksiya).
import { beforeAll, describe, expect, it } from 'vitest';
import { mockEnv } from '../../dev/mock-firestore.js';
import { buildWrites, toValue, fromValue, _resetCaches, type FsWrite } from '../../server/firestore.js';
import { OpSchema, type Op } from '../../shared/schema.js';

beforeAll(() => {
  Object.assign(process.env, mockEnv('http://127.0.0.1:1/v1'));
  _resetCaches();
});
const NOW = '2026-11-19T00:00:00.000Z';
const upd = (w: FsWrite) => {
  if (!('update' in w)) throw new Error('update gözlənilirdi');
  return w;
};

describe('buildWrites', () => {
  it('Tasks upsert: updateMask = göndərilən sahələr + updated_by/updated_at + _deleted', () => {
    const ops: Op[] = [{ t: 'upsert', table: 'Tasks', row: { id: 'B-1', hours: 12, owner_after: 'Zümrüd' } }];
    const [w, meta] = buildWrites(ops, 'Ecosystem', NOW).map(upd);
    expect(w.update.name).toMatch(/documents\/tasks\/B-1$/);
    expect(w.updateMask?.fieldPaths.sort()).toEqual(
      ['_deleted', 'hours', 'id', 'owner_after', 'updated_at', 'updated_by'].sort(),
    );
    expect(w.update.fields.updated_by).toEqual({ stringValue: 'Ecosystem' });
    expect(w.update.fields.updated_at).toEqual({ stringValue: NOW });
    expect(w.updateTransforms).toEqual([{ fieldPath: '_ts', setToServerValue: 'REQUEST_TIME' }]);
    expect(meta.update.name).toMatch(/meta\/main$/);
    expect(meta.updateMask?.fieldPaths).toEqual([]);
  });

  it('Employees upsert updated_by əlavə etmir', () => {
    const [w] = buildWrites([{ t: 'upsert', table: 'Employees', row: { name: 'Ülkər', fte: 1 } }], 'u', NOW).map(upd);
    expect(w.update.name).toMatch(/employees\/Ülkər$/);
    expect(w.updateMask?.fieldPaths.sort()).toEqual(['_deleted', 'fte', 'name']);
  });

  it('delete yalnız _deleted sahəsini dəyişir', () => {
    const [w] = buildWrites([{ t: 'delete', table: 'Tasks', key: 'B-9' }], 'u', NOW).map(upd);
    expect(w.updateMask?.fieldPaths).toEqual(['_deleted']);
    expect(w.update.fields).toEqual({ _deleted: { booleanValue: true } });
  });

  it('Settings meta/main-ə yazılır, log ayrıca sənəd', () => {
    const writes = buildWrites(
      [
        { t: 'upsert', table: 'Settings', row: { key: 'norm', value: '2000' } },
        { t: 'log', row: { id: 'L-1', action: 'X' } },
      ],
      'u',
      NOW,
    ).map(upd);
    expect(writes).toHaveLength(2);
    expect(writes[0].update.name).toMatch(/log\/L-1$/);
    expect(writes[0].update.fields).toMatchObject({
      action: { stringValue: 'X' },
      user: { stringValue: 'u' },
      ts: { stringValue: NOW },
    });
    expect(writes[0].update.fields.id).toBeUndefined();
    expect(writes[1].update.fields).toEqual({ norm: { integerValue: '2000' } });
    expect(writes[1].updateMask?.fieldPaths).toEqual(['norm']);
  });

  it('boş op siyahısı → yazı yoxdur', () => expect(buildWrites([], 'u')).toEqual([]));
});

describe('dəyər çevirmə', () => {
  it.each([
    [null, null],
    ['', null],
    [true, true],
    [5, 5],
    [1.5, 1.5],
    ['ə', 'ə'],
  ])('%j ↔ Firestore', (v, back) => expect(fromValue(toValue(v))).toBe(back));
});

describe('OpSchema — v1 klientinin real sorğuları keçir', () => {
  it.each<[string, unknown]>([
    [
      'tam tapşırıq sətri',
      {
        t: 'upsert',
        table: 'Tasks',
        row: {
          id: 'T-abc',
          company: 'Birbank',
          process: 'P',
          category: 'C',
          task: 'İş',
          description: '',
          owner_before: '',
          owner_after: 'Ülkər',
          min_per_key: null,
          annual_freq: 12,
          unit: 'say',
          hours: 4.5,
          after_opt: null,
          is_cancelled: false,
          updated_at: NOW,
        },
      },
    ],
    [
      'əməkdaş',
      {
        t: 'upsert',
        table: 'Employees',
        row: { name: 'Şöbə əməkdaşları', company: 'Birbank', activity: 'Administrativ', fte: 1, is_group: true, active: true },
      },
    ],
    ['ayar', { t: 'upsert', table: 'Settings', row: { key: 'norm', value: 1922 } }],
    [
      'jurnal',
      {
        t: 'log',
        row: { id: 'L-x', ts: NOW, action: 'Ötürmə', task_id: 'B-1', task_label: 'a', from: 'A', to: 'B', comment: '' },
      },
    ],
    ['silmə', { t: 'delete', table: 'Employees', key: 'Kamilə' }],
  ])('%s', (_n, op) => expect(OpSchema.safeParse(op).success).toBe(true));
});
