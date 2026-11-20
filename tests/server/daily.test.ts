// Mərhələ 9 (SPEC §14, §7.10): gündəlik snapshot + backup + təmizlik, cron icazəsi, snapshots/health endpoint-ləri.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { client, startApi, type TestApi } from '../helpers/apiServer.js';
import { bakuDate, packBackup, unpackBackup } from '../../server/daily.js';
import { computeMetrics } from '../../shared/metrics.js';
import { normalizeEmployee, normalizeTask } from '../../shared/model.js';
import { DEFAULT_SETTINGS } from '../../shared/constants.js';
import { readFileSync } from 'node:fs';
import type { Request } from '../../src/store/dataStore.js';

let api: TestApi;
let admin: Request;
let editor: Request;
const seed = JSON.parse(readFileSync(new URL('../../data/seed.json', import.meta.url), 'utf8'));
const PREFIX = 'projects/demo/databases/(default)/documents/';
const raw = (path: string, init: RequestInit = {}) => fetch(api.base + path, init);

beforeAll(async () => {
  api = await startApi();
  admin = (await client(api.base)).request;
  await admin('/api/data');
  await admin('/api/users', { json: { action: 'add', name: 'Redaktor', password: 'Gizli-Soz-2026!', role: 'editor' } });
  editor = (await client(api.base, 'Redaktor', 'Gizli-Soz-2026!')).request;
});
afterAll(() => api.close());

describe('köməkçilər', () => {
  it('Bakı tarixi (UTC+4): 20:30 UTC artıq növbəti gündür', () => {
    expect(bakuDate(Date.parse('2026-11-20T19:59:00Z'))).toBe('2026-11-20');
    expect(bakuDate(Date.parse('2026-11-20T20:01:00Z'))).toBe('2026-11-21');
  });
  it('backup paketi gzip+base64 hissələr, geri açılır', () => {
    const p = { date: '2026-11-20', created: 'x', tasks: seed.tasks, employees: seed.employees, settings: {} };
    const parts = packBackup(p);
    expect(parts.length).toBeGreaterThanOrEqual(1);
    expect(parts.every((x) => x.length <= 900_000)).toBe(true);
    expect(unpackBackup(parts).tasks).toHaveLength(341);
  });
});

describe('cron icazəsi', () => {
  it('cron agenti olmayan sorğu → 401; Vercel cron → 200; CRON_SECRET varsa Bearer tələb olunur', async () => {
    expect((await raw('/api/cron/daily')).status).toBe(401);
    expect((await raw('/api/cron/daily', { headers: { 'user-agent': 'vercel-cron/1.0' } })).status).toBe(200);
    process.env.CRON_SECRET = 'sirr-123';
    try {
      expect((await raw('/api/cron/daily', { headers: { 'user-agent': 'vercel-cron/1.0' } })).status).toBe(401);
      expect((await raw('/api/cron/daily', { headers: { authorization: 'Bearer sirr-123' } })).status).toBe(200);
    } finally {
      delete process.env.CRON_SECRET;
    }
  });
});

describe('gündəlik iş', () => {
  it('snapshot Panel rəqəmləri ilə eynidir; backup bərpa üçün oxunur; meta.updated dəyişmir', async () => {
    const before = api.fs.dump()['meta/main'].updated;
    const r = (await admin('/api/snapshots', { json: { action: 'run' } })) as { date: string; backupParts: number };
    expect(r.backupParts).toBe(1);
    const d = api.fs.dump();
    expect(d['meta/main'].updated).toBe(before); // klientlər boş yerə delta almır
    expect(d['meta/main'].last_backup).toBeTruthy();
    const { snapshots } = (await admin(`/api/snapshots?from=${r.date}&to=${r.date}`)) as {
      snapshots: { total: { fteNeed: number; over: number }; loads: Record<string, number>; norm: number }[];
    };
    const m = computeMetrics({
      tasks: seed.tasks.map(normalizeTask),
      employees: seed.employees.map(normalizeEmployee),
      settings: { ...DEFAULT_SETTINGS },
    });
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0].norm).toBe(1682);
    expect(snapshots[0].total.fteNeed).toBeCloseTo(m.fteNeed, 2);
    expect(snapshots[0].total.over).toBe(7);
    expect(snapshots[0].loads['Ülkər']).toBeCloseTo(m.people.find((p) => p.name === 'Ülkər')!.load, 3);
    const { backups } = (await admin('/api/snapshots?backups=1')) as { backups: { date: string; tasks: number }[] };
    expect(backups[0]).toMatchObject({ date: r.date, tasks: 341 });
    const { backup } = (await admin(`/api/snapshots?backup=${r.date}`)) as { backup: { tasks: unknown[]; employees: unknown[] } };
    expect(backup.tasks).toHaveLength(341);
    expect(backup.employees).toHaveLength(23);
  });

  it('təmizlik: 30 gündən köhnə backup, 90 gündən köhnə tombstone, 30 gündən köhnə xəta silinir; təkrar işləmə idempotentdir', async () => {
    const old = new Date(Date.now() - 100 * 864e5).toISOString();
    const docs = api.fs.docs as Map<string, Record<string, Record<string, unknown>>>;
    docs.set(PREFIX + 'backups/2020-01-01', { date: { stringValue: '2020-01-01' }, parts: { integerValue: '1' } });
    docs.set(PREFIX + 'backups/2020-01-01~1', { date: { stringValue: '2020-01-01' }, data: { stringValue: 'x' } });
    docs.set(PREFIX + 'tasks/T-old', {
      id: { stringValue: 'T-old' },
      _deleted: { booleanValue: true },
      _ts: { timestampValue: old },
    });
    docs.set(PREFIX + 'tasks/T-new', {
      id: { stringValue: 'T-new' },
      _deleted: { booleanValue: true },
      _ts: { timestampValue: new Date().toISOString() },
    });
    docs.set(PREFIX + 'errors/E-old', { message: { stringValue: 'x' }, _ts: { timestampValue: old } });
    const r = (await admin('/api/snapshots', { json: { action: 'run' } })) as {
      tombstonesDeleted: number;
      backupsDeleted: number;
      errorsDeleted: number;
    };
    expect(r).toMatchObject({ tombstonesDeleted: 1, backupsDeleted: 1, errorsDeleted: 1 });
    const d = api.fs.dump();
    expect(d['tasks/T-old']).toBeUndefined();
    expect(d['tasks/T-new']).toBeDefined();
    expect(d['backups/2020-01-01~1']).toBeUndefined();
    // Eyni gün təkrar: bir snapshot, bir backup
    const today = bakuDate();
    expect(Object.keys(api.fs.dump()).filter((k) => k.startsWith(`backups/${today}`))).toEqual(
      [`backups/${today}`, `backups/${today}~1`].sort(),
    );
  });

  it('90 gündən köhnə `since` → tam yükləmə (silinmiş tombstone-lar itməsin)', async () => {
    const r = (await admin(`/api/data?since=${encodeURIComponent(new Date(Date.now() - 120 * 864e5).toISOString())}`)) as {
      full?: boolean;
    };
    expect(r.full).toBe(true);
  });
});

describe('RBAC və health', () => {
  it('snapshots: hamı trend oxuyur; backup-lar və "indi işlət" yalnız admin', async () => {
    await expect(editor('/api/snapshots')).resolves.toHaveProperty('snapshots');
    await expect(editor('/api/snapshots?backups=1')).rejects.toMatchObject({ status: 403 });
    await expect(editor('/api/snapshots', { json: { action: 'run' } })).rejects.toMatchObject({ status: 403 });
    await expect(admin('/api/snapshots?from=2026-13-01&to=x')).rejects.toMatchObject({ status: 400 });
  });

  it('health v2: firestore ok, son backup; klient xətası yazılır, admin görür, limit', async () => {
    const h = (await (await raw('/api/health')).json()) as Record<string, unknown>;
    expect(h).toMatchObject({ firestore: 'ok', cron_secret: 'yoxdur' });
    expect(h.lastBackup).toBeTruthy();
    expect(
      (await raw('/api/health', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } })).status,
    ).toBe(401);
    await editor('/api/health', { json: { message: 'TypeError: x is undefined', url: '/tasks', version: '2.0.0' } });
    const { errors } = (await admin('/api/health?errors=1')) as { errors: { message: string; user: string }[] };
    expect(errors[0]).toMatchObject({ message: 'TypeError: x is undefined', user: 'Redaktor' });
    await expect(editor('/api/health?errors=1')).rejects.toMatchObject({ status: 403 });
    for (let i = 0; i < 25; i++) await editor('/api/health', { json: { message: `e${i}` } });
    const after = (await admin('/api/health?errors=1')) as { errors: unknown[] };
    expect(after.errors.length).toBeLessThanOrEqual(21);
  });
});
