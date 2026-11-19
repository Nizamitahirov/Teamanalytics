// Domen modeli: normallaşdırma, status, diff → Op (v1 app.js məntiqinin TS köçürməsi + `_v` versiyası).
// Həm klient (store), həm testlər istifadə edir.
import { ACT_ADMIN, DEFAULT_SETTINGS } from './constants.js';
import type { Employee, LogEntry, Op, Settings, Task } from './schema.js';

/** Sənəd + server versiyası (`_v`, SPEC §4.3). Versiyası olmayan köhnə sənədlər `0` sayılır. */
export type TaskDoc = Task & { _v?: number };
export type EmployeeDoc = Employee & { _v?: number };
export type DataState = { tasks: TaskDoc[]; employees: EmployeeDoc[]; log: LogEntry[]; settings: Settings };

export const STATUSES = ['Mövcud', 'Yeni', 'Transfer', 'Ləğv'] as const;
export type Status = (typeof STATUSES)[number];

export const TASK_FIELDS = [
  'id',
  'company',
  'process',
  'category',
  'task',
  'description',
  'owner_before',
  'owner_after',
  'min_per_key',
  'annual_freq',
  'unit',
  'hours',
  'after_opt',
  'is_cancelled',
  'updated_at',
] as const;
export const EMP_FIELDS = ['name', 'company', 'activity', 'fte', 'is_group', 'active'] as const;
/** Ziddiyyət yoxlamasında nəzərə alınmayan texniki sahələr (hər yazmada dəyişir). */
export const META_FIELDS = new Set(['updated_at', 'updated_by']);

const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const truthy = (v: unknown) => v === true || /^(true|bəli|1|yes)$/i.test(String(v ?? '').trim());
const str = (v: unknown) => (v == null ? '' : String(v));
const ver = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function normalizeTask(t: Record<string, unknown>): TaskDoc {
  return {
    id: str(t.id),
    company: str(t.company) || 'Birbank',
    process: str(t.process).trim(),
    category: str(t.category).trim(),
    task: str(t.task).trim(),
    description: str(t.description),
    owner_before: str(t.owner_before).trim(),
    owner_after: str(t.owner_after).trim(),
    min_per_key: num(t.min_per_key),
    annual_freq: num(t.annual_freq),
    unit: str(t.unit) || 'say',
    hours: num(t.hours) ?? 0,
    after_opt: num(t.after_opt),
    is_cancelled: truthy(t.is_cancelled),
    updated_at: str(t.updated_at),
    updated_by: str(t.updated_by),
    _v: ver(t._v),
  };
}

export function normalizeEmployee(e: Record<string, unknown>): EmployeeDoc {
  return {
    name: str(e.name).trim(),
    company: str(e.company) || 'Birbank',
    activity: str(e.activity) || ACT_ADMIN,
    fte: num(e.fte) ?? 1,
    is_group: truthy(e.is_group),
    active: e.active === undefined || e.active === null || e.active === '' ? true : truthy(e.active),
    _v: ver(e._v),
  };
}

export function normalizeSettings(s: Record<string, unknown> | undefined): Settings {
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const n = num(s?.[k]);
    if (n != null) out[k] = n;
  }
  return out;
}

export const curOwner = (t: Pick<Task, 'owner_after' | 'owner_before'>) => (t.owner_after || t.owner_before || '').trim();

export function statusOf(t: Pick<Task, 'is_cancelled' | 'owner_before' | 'owner_after'>): Status {
  if (t.is_cancelled) return 'Ləğv';
  if (!t.owner_before && t.owner_after) return 'Yeni';
  if (t.owner_after && t.owner_before && t.owner_after !== t.owner_before) return 'Transfer';
  return 'Mövcud';
}

export const taskLabel = (t: Pick<Task, 'process' | 'task'>) => `${t.process} — ${t.task}`;

/* ---------- diff → Op ---------- */
const same = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);

/**
 * Əvvəlki və indiki vəziyyət arasındakı fərqi baza əməliyyatlarına çevirir.
 * v1-dən fərqi: yalnız DƏYİŞƏN sahələr göndərilir (server updateMask ilə yazır), hər op-da
 * gördüyümüz versiya (`v`) və dəyişən sahələrin köhnə dəyərləri (`base`) var — server ziddiyyəti
 * bunlarla aşkarlayır, fərqli sahələr dəyişibsə səssiz birləşdirir (SPEC §4.3).
 */
export function diffOps(prev: Omit<DataState, 'log'>, cur: Omit<DataState, 'log'>): Op[] {
  const ops: Op[] = [];
  const pT = new Map(prev.tasks.map((t) => [t.id, t]));
  const cT = new Set<string>();
  for (const t of cur.tasks) {
    cT.add(t.id);
    const p = pT.get(t.id);
    const row = diffRow(p, t, TASK_FIELDS, 'id');
    if (row) ops.push({ t: 'upsert', table: 'Tasks', ...row, v: p?._v ?? 0 });
  }
  for (const t of prev.tasks) if (!cT.has(t.id)) ops.push({ t: 'delete', table: 'Tasks', key: t.id, v: t._v ?? 0 });

  const pE = new Map(prev.employees.map((e) => [e.name, e]));
  const cE = new Set<string>();
  for (const e of cur.employees) {
    cE.add(e.name);
    const p = pE.get(e.name);
    const row = diffRow(p, e, EMP_FIELDS, 'name');
    if (row) ops.push({ t: 'upsert', table: 'Employees', ...row, v: p?._v ?? 0 });
  }
  for (const e of prev.employees) if (!cE.has(e.name)) ops.push({ t: 'delete', table: 'Employees', key: e.name, v: e._v ?? 0 });

  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[])
    if (cur.settings[k] !== prev.settings[k])
      ops.push({ t: 'upsert', table: 'Settings', row: { key: k, value: cur.settings[k] } });
  return ops;
}

type Scalar = string | number | boolean | null;
function diffRow<T extends Record<string, unknown>>(
  prev: T | undefined,
  cur: T,
  fields: readonly string[],
  key: string,
): { row: Record<string, Scalar>; base: Record<string, Scalar> } | null {
  const row: Record<string, Scalar> = { [key]: cur[key] as Scalar };
  const base: Record<string, Scalar> = {};
  let changed = false;
  for (const f of fields) {
    if (f === key) continue;
    const v = (cur[f] ?? null) as Scalar;
    if (!prev) {
      row[f] = v;
      changed = true;
    } else if (!same(prev[f], cur[f])) {
      row[f] = v;
      if (!META_FIELDS.has(f)) base[f] = (prev[f] ?? null) as Scalar;
      changed = true;
    }
  }
  return changed ? { row, base } : null;
}
