// Gündəlik əməliyyatlar (SPEC §14, §7.10): snapshot + backup + təmizlik. Vercel Cron → /api/cron/daily.
// Snapshot/backup yazıları meta.updated-i DƏYİŞMİR (klientlər boş yerə delta almasın).
import { gunzipSync, gzipSync } from 'node:zlib';
import { normalizeEmployee, normalizeSettings, normalizeTask } from '../shared/model.js';
import {
  commitRaw,
  docDelete,
  getDoc,
  getMeta,
  listAll,
  metaFieldsWrite,
  plainWrite,
  queryRange,
  type Doc,
  type FsWrite,
} from './firestore.js';

export const BACKUP_DAYS = 30;
export const TOMBSTONE_DAYS = 90;
export const ERROR_DAYS = 30;
const PART = 900_000; // Firestore sənədi ≤ 1 MiB — base64 hissə ≤ 900 KB
const DAY = 864e5;

/** Bakı vaxtı (UTC+4, yay vaxtı yoxdur) ilə tarix — snapshot "bu gün"ə yazılır. */
export const bakuDate = (now = Date.now()) => new Date(now + 4 * 3600e3).toISOString().slice(0, 10);

export { buildSnapshot, type SnapshotData } from '../shared/snapshot.js';
import type { SnapshotData } from '../shared/snapshot.js';
import { buildSnapshot } from '../shared/snapshot.js';

export type BackupPayload = {
  date: string;
  created: string;
  tasks: Record<string, unknown>[];
  employees: Record<string, unknown>[];
  settings: Record<string, unknown>;
};

/** gzip + base64, ≤ 900 KB hissələr. */
export function packBackup(p: BackupPayload): string[] {
  const b64 = gzipSync(Buffer.from(JSON.stringify(p), 'utf8')).toString('base64');
  const parts: string[] = [];
  for (let i = 0; i < b64.length; i += PART) parts.push(b64.slice(i, i + PART));
  return parts;
}
export const unpackBackup = (parts: string[]): BackupPayload =>
  JSON.parse(gunzipSync(Buffer.from(parts.join(''), 'base64')).toString('utf8'));

const clean = (d: Doc) => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_')));
const older = (ts: unknown, days: number, now: number) => typeof ts === 'string' && Date.parse(ts) < now - days * DAY;

export type DailyResult = {
  date: string;
  snapshot: boolean;
  backupParts: number;
  backupsDeleted: number;
  tombstonesDeleted: number;
  errorsDeleted: number;
};

/**
 * Snapshot (`snapshots/{date}`) + backup (`backups/{date}` meta + `backups/{date}~{n}` hissələr) +
 * 30 gündən köhnə backup-lar, 90 gündən köhnə tombstone-lar, 30 gündən köhnə klient xətaları silinir.
 * Eyni gün təkrar işləsə üzərinə yazır (idempotent). Oxuma: ~ sənəd sayı (gündə 1 dəfə).
 */
export async function runDaily(now = Date.now()): Promise<DailyResult> {
  const date = bakuDate(now);
  const [tasksAll, empsAll, meta, backups, errors] = await Promise.all([
    listAll('tasks'),
    listAll('employees'),
    getMeta(),
    listAll('backups'),
    listAll('errors'),
  ]);
  const tasks = tasksAll.filter((t) => !t._deleted);
  const emps = empsAll.filter((e) => !e._deleted);
  const settings = normalizeSettings(meta ?? {});
  const input = {
    tasks: tasks.map((t) => normalizeTask({ ...t, id: t.id || t._id })),
    employees: emps.map((e) => normalizeEmployee({ ...e, name: e.name || e._id })),
    settings,
  };
  const iso = new Date(now).toISOString();
  const snap = buildSnapshot(input, date);
  const parts = packBackup({
    date,
    created: iso,
    tasks: tasks.map((t) => ({ ...clean(t), id: t.id || t._id })),
    employees: emps.map((e) => ({ ...clean(e), name: e.name || e._id })),
    settings: Object.fromEntries(Object.entries(meta ?? {}).filter(([k]) => !k.startsWith('_') && k !== 'updated')),
  });

  const writes: FsWrite[] = [
    plainWrite('snapshots', date, { date, data: JSON.stringify(snap) }),
    // Köhnə hissələr (əvvəlki işləmə daha çox hissə yazmışdısa) silinir
    ...backups.filter((b) => b._id.startsWith(`${date}~`)).map((b) => docDelete('backups', b._id)),
    ...parts.map((data, i) => plainWrite('backups', `${date}~${i + 1}`, { date, part: i + 1, data })),
    plainWrite('backups', date, {
      date,
      parts: parts.length,
      created: iso,
      tasks: tasks.length,
      employees: emps.length,
      size: parts.reduce((s, p) => s + p.length, 0),
    }),
    metaFieldsWrite({ last_snapshot: iso, last_backup: iso }),
  ];
  // Təmizlik
  const cutoff = bakuDate(now - BACKUP_DAYS * DAY);
  const oldBackups = backups.filter((b) => String(b.date ?? b._id.slice(0, 10)) < cutoff);
  const tomb = [
    ...tasksAll.filter((t) => t._deleted && older(t._ts, TOMBSTONE_DAYS, now)).map((t) => docDelete('tasks', t._id)),
    ...empsAll.filter((e) => e._deleted && older(e._ts, TOMBSTONE_DAYS, now)).map((e) => docDelete('employees', e._id)),
  ];
  const oldErrors = errors.filter((e) => older(e._ts, ERROR_DAYS, now));
  writes.push(
    ...oldBackups.map((b) => docDelete('backups', b._id)),
    ...tomb,
    ...oldErrors.map((e) => docDelete('errors', e._id)),
  );
  await commitRaw(writes);
  return {
    date,
    snapshot: true,
    backupParts: parts.length,
    backupsDeleted: oldBackups.filter((b) => !b._id.includes('~')).length,
    tombstonesDeleted: tomb.length,
    errorsDeleted: oldErrors.length,
  };
}

export async function getSnapshots(from: string, to: string): Promise<SnapshotData[]> {
  return (await queryRange('snapshots', 'date', from, to)).map((d) => JSON.parse(String(d.data)) as SnapshotData);
}

export async function listBackups() {
  return (await listAll('backups'))
    .filter((b) => !b._id.includes('~'))
    .map((b) => ({
      date: String(b.date ?? b._id),
      created: String(b.created ?? ''),
      parts: Number(b.parts) || 0,
      tasks: Number(b.tasks) || 0,
      employees: Number(b.employees) || 0,
      size: Number(b.size) || 0,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function readBackup(date: string): Promise<BackupPayload | null> {
  const m = await getDoc('backups', date);
  if (!m || !m.parts) return null;
  const parts = await Promise.all(Array.from({ length: Number(m.parts) }, (_, i) => getDoc('backups', `${date}~${i + 1}`)));
  if (parts.some((p) => !p)) return null;
  return unpackBackup(parts.map((p) => String(p!.data)));
}

/** Tombstone-lar 90 gündən sonra silindiyi üçün daha köhnə `since` ilə delta etibarlı deyil → tam yükləmə. */
export const sinceTooOld = (since: string, now = Date.now()) => Date.parse(since) < now - (TOMBSTONE_DAYS - 1) * DAY;
