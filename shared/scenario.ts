// Ssenarilər (SPEC §6.5): "nə olardı?" təhlili. Ssenari = ad + dəyişikliklər siyahısı; hər dəyişiklik bir
// və ya bir neçə Op-dur (yalnız upsert, `base` = yaradılan anda CANLI datadakı köhnə dəyərlər).
// Ssenari datası = canlı data + op-ların lokal tətbiqi (shared/apply.ts). Canlı dataya yazma yalnız
// "Tətbiq et" ilə, adi sinxron axını (commit → diffOps → /api/ops) üzərindən olur.
import { applyOpsTo, type Snapshot } from './apply.js';
import { computeMetrics, effHours, type EmployeeLoad, type Metrics } from './metrics.js';
import { curOwner, META_FIELDS, taskLabel, type EmployeeDoc, type TaskDoc } from './model.js';
import { rebalance, type RebalanceOptions, type RebalanceResult } from './rebalance.js';
import type { LogEntry, Op } from './schema.js';

export const SCENARIO_STATUSES = ['draft', 'pending', 'applied', 'archived'] as const;
export type ScenarioStatus = (typeof SCENARIO_STATUSES)[number];

export const CHANGE_KINDS = [
  'transfer',
  'cancel',
  'restore',
  'hours',
  'task_new',
  'emp_add',
  'emp_remove',
  'fte',
  'norm',
  'automate',
] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

type Scalar = string | number | boolean | null;
export type UpsertOp = Extract<Op, { t: 'upsert' }>;
export type ScenarioChange = {
  id: string;
  kind: ChangeKind;
  label: string;
  ops: UpsertOp[];
  /** Balanslama alqoritmindən gəlib (UI-da nişan) */
  auto?: boolean;
};

export type Scenario = {
  id: string;
  name: string;
  description: string;
  status: ScenarioStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
  /** Ssenari yaradılanda canlı datanın vaxtı (meta.updated) */
  base_ts: string;
  changes: ScenarioChange[];
  /** Təsdiq/tətbiq məlumatı */
  submitted_by?: string;
  applied_by?: string;
  applied_at?: string;
  review_comment?: string;
};

let seq = 0;
export const changeId = () => 'c' + Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);

/** Ssenarinin bütün op-ları ardıcıllıqla. */
export const scenarioOps = (changes: readonly ScenarioChange[]): UpsertOp[] => changes.flatMap((c) => c.ops);
/** Ssenari datası = baza + dəyişikliklər. */
export const scenarioData = (live: Snapshot, changes: readonly ScenarioChange[]): Snapshot =>
  applyOpsTo(live, scenarioOps(changes));

/* ---------- base: canlı datadakı köhnə dəyərlər ---------- */
const docOf = (live: Snapshot, op: UpsertOp): Record<string, unknown> | undefined => {
  if (op.table === 'Tasks') return live.tasks.find((t) => t.id === op.row.id);
  if (op.table === 'Employees') return live.employees.find((e) => e.name === op.row.name);
  return undefined;
};
/** Op-lara canlı datadakı köhnə dəyərləri (`base`) əlavə edir — tətbiq anında ziddiyyət yoxlaması üçün. */
export function withBase(live: Snapshot, ops: UpsertOp[]): UpsertOp[] {
  return ops.map((op) => {
    if (op.table === 'Settings') return op;
    const doc = docOf(live, op);
    if (!doc) return op;
    const key = op.table === 'Tasks' ? 'id' : 'name';
    const base: Record<string, Scalar> = {};
    for (const f of Object.keys(op.row)) if (f !== key && !META_FIELDS.has(f)) base[f] = (doc[f] ?? null) as Scalar;
    return { ...op, base } as UpsertOp;
  });
}

/* ---------- dəyişiklik qurucuları ---------- */
// `scen` — cari ssenari datası (əvvəlki dəyişikliklər daxil), `live` — canlı data (base üçün).
type Ctx = { scen: Snapshot; live: Snapshot };
const mk = (ctx: Ctx, kind: ChangeKind, label: string, ops: UpsertOp[], auto = false): ScenarioChange => ({
  id: changeId(),
  kind,
  label,
  ops: withBase(ctx.live, ops),
  ...(auto ? { auto } : {}),
});
const taskOps = (rows: Record<string, Scalar>[]): UpsertOp[] => rows.map((row) => ({ t: 'upsert', table: 'Tasks', row }));
const fmtH = (h: number) => (Math.round(h * 10) / 10).toString().replace('.', ',');

/** Ötürmə — v1 qaydası: owner_before ilkin sahib kimi saxlanır (boşdursa cari sahib), owner_after = yeni. */
export function transferChange(ctx: Ctx, ids: string[], to: string, auto = false): ScenarioChange | null {
  to = to.trim();
  const list = ctx.scen.tasks.filter((t) => ids.includes(t.id) && curOwner(t) !== to);
  if (!list.length || !to) return null;
  const rows = list.map((t) => {
    const row: Record<string, Scalar> = { id: t.id, owner_after: to };
    if (!t.owner_before) row.owner_before = curOwner(t);
    return row;
  });
  const ops = taskOps(rows);
  if (!ctx.scen.employees.some((e) => e.name === to))
    ops.unshift({
      t: 'upsert',
      table: 'Employees',
      row: { name: to, company: list[0].company, activity: 'Administrativ', fte: 1, is_group: false, active: true },
    });
  const hours = list.reduce((s, t) => s + effHours(t), 0);
  const label =
    list.length === 1
      ? `${taskLabel(list[0])}: ${curOwner(list[0])} → ${to}`
      : `${list.length} tapşırıq (${fmtH(hours)} saat) → ${to}`;
  return mk(ctx, 'transfer', label, ops, auto);
}

export function cancelChange(ctx: Ctx, ids: string[], value = true): ScenarioChange | null {
  const list = ctx.scen.tasks.filter((t) => ids.includes(t.id) && t.is_cancelled !== value);
  if (!list.length) return null;
  const hours = list.reduce((s, t) => s + t.hours, 0);
  const what = list.length === 1 ? taskLabel(list[0]) : `${list.length} tapşırıq`;
  return mk(
    ctx,
    value ? 'cancel' : 'restore',
    `${what} ${value ? 'ləğv edilir' : 'bərpa edilir'} (${fmtH(hours)} saat)`,
    taskOps(list.map((t) => ({ id: t.id, is_cancelled: value }))),
  );
}

export function hoursChange(ctx: Ctx, id: string, hours: number): ScenarioChange | null {
  const t = ctx.scen.tasks.find((x) => x.id === id);
  if (!t || !Number.isFinite(hours) || hours < 0 || t.hours === hours) return null;
  return mk(ctx, 'hours', `${taskLabel(t)}: ${fmtH(t.hours)} → ${fmtH(hours)} saat`, taskOps([{ id, hours }]));
}

export function newTaskChange(
  ctx: Ctx,
  v: { id: string; company: string; process: string; category?: string; task: string; hours: number; owner: string },
): ScenarioChange | null {
  if (!v.process.trim() || !v.task.trim() || !Number.isFinite(v.hours) || v.hours <= 0) return null;
  const ops: UpsertOp[] = [];
  const owner = v.owner.trim();
  if (owner && !ctx.scen.employees.some((e) => e.name === owner))
    ops.push({
      t: 'upsert',
      table: 'Employees',
      row: { name: owner, company: v.company, activity: 'Administrativ', fte: 1, is_group: false, active: true },
    });
  ops.push(
    ...taskOps([
      {
        id: v.id,
        company: v.company,
        process: v.process.trim(),
        category: (v.category ?? '').trim(),
        task: v.task.trim(),
        description: '',
        owner_before: '',
        owner_after: owner,
        min_per_key: null,
        annual_freq: null,
        unit: 'say',
        hours: v.hours,
        after_opt: null,
        is_cancelled: false,
      },
    ]),
  );
  return mk(
    ctx,
    'task_new',
    `Yeni iş: ${v.process.trim()} — ${v.task.trim()} (${fmtH(v.hours)} saat${owner ? ', ' + owner : ''})`,
    ops,
  );
}

export function addEmployeeChange(
  ctx: Ctx,
  e: Pick<EmployeeDoc, 'name' | 'company' | 'activity' | 'fte'>,
): ScenarioChange | null {
  const name = e.name.trim();
  if (!name || ctx.scen.employees.some((x) => x.name === name) || !(e.fte > 0)) return null;
  return mk(ctx, 'emp_add', `Yeni əməkdaş: ${name} (${fmtH(e.fte)} ştat)`, [
    {
      t: 'upsert',
      table: 'Employees',
      row: { name, company: e.company, activity: e.activity, fte: e.fte, is_group: false, active: true },
    },
  ]);
}

/** Əməkdaş çıxır (aktiv deyil). İşləri ayrıca ötürülür (şablon `leaveTemplate` alqoritmlə paylayır). */
export function removeEmployeeChange(ctx: Ctx, name: string): ScenarioChange | null {
  const e = ctx.scen.employees.find((x) => x.name === name);
  if (!e || !e.active) return null;
  return mk(ctx, 'emp_remove', `${name} ayrılır`, [{ t: 'upsert', table: 'Employees', row: { name, active: false } }]);
}

export function fteChange(ctx: Ctx, name: string, fte: number): ScenarioChange | null {
  const e = ctx.scen.employees.find((x) => x.name === name);
  if (!e || !Number.isFinite(fte) || fte < 0 || e.fte === fte) return null;
  return mk(ctx, 'fte', `${name}: ştat ${fmtH(e.fte)} → ${fmtH(fte)}`, [{ t: 'upsert', table: 'Employees', row: { name, fte } }]);
}

export function normChange(ctx: Ctx, norm: number): ScenarioChange | null {
  if (!Number.isFinite(norm) || norm <= 0 || ctx.scen.settings.norm === norm) return null;
  return mk(ctx, 'norm', `Norma: ${ctx.scen.settings.norm} → ${norm} saat/il`, [
    { t: 'upsert', table: 'Settings', row: { key: 'norm', value: norm } },
  ]);
}

/** Prosesi avtomatlaşdır: aktiv işlərin saatı X% azalır. */
export function automateChange(ctx: Ctx, process: string, pct: number): ScenarioChange | null {
  if (!(pct > 0 && pct <= 100)) return null;
  const list = ctx.scen.tasks.filter((t) => t.process === process && !t.is_cancelled && t.hours > 0);
  if (!list.length) return null;
  const k = 1 - pct / 100;
  const saved = list.reduce((s, t) => s + t.hours * (pct / 100), 0);
  return mk(
    ctx,
    'automate',
    `${process} avtomatlaşdırılır: −${pct}% (${fmtH(saved)} saat qənaət)`,
    taskOps(list.map((t) => ({ id: t.id, hours: Math.round(t.hours * k * 100) / 100 }))),
  );
}

/* ---------- balanslama → dəyişikliklər ---------- */
/** Alqoritmin hər təklifi ayrıca dəyişiklikdir — redaktorda tək-tək çıxarıla bilər. */
export function rebalanceChanges(ctx: Ctx, result: RebalanceResult): ScenarioChange[] {
  const out: ScenarioChange[] = [];
  let scen = ctx.scen;
  for (const tr of result.transfers) {
    const c = transferChange({ scen, live: ctx.live }, [tr.taskId], tr.to, true);
    if (!c) continue;
    out.push(c);
    scen = applyOpsTo(scen, c.ops);
  }
  return out;
}

/* ---------- şablonlar (SPEC §6.5) ---------- */
export function leaveTemplate(ctx: Ctx, name: string, opts: RebalanceOptions = {}) {
  const rm = removeEmployeeChange(ctx, name);
  const res = rebalance(ctx.scen, { ...opts, evacuate: [name] });
  const moves = rebalanceChanges(ctx, res);
  return { changes: [...(rm ? [rm] : []), ...moves], result: res };
}
export function hireTemplate(
  ctx: Ctx,
  e: Pick<EmployeeDoc, 'name' | 'company' | 'activity' | 'fte'>,
  opts: RebalanceOptions = {},
) {
  const add = addEmployeeChange(ctx, e);
  if (!add) return { changes: [], result: null };
  const scen = applyOpsTo(ctx.scen, add.ops);
  const res = rebalance(scen, opts);
  return { changes: [add, ...rebalanceChanges({ scen, live: ctx.live }, res)], result: res };
}

/* ---------- müqayisə ---------- */
export type PersonDiff = {
  name: string;
  before: number;
  after: number;
  hoursBefore: number;
  hoursAfter: number;
};
export type Comparison = { cur: Metrics; next: Metrics; people: PersonDiff[]; changed: PersonDiff[] };

/** Cari vs ssenari: KPI-lar (§7 formulaları — computeMetrics) və əməkdaş üzrə yük. */
export function compare(live: Snapshot, scen: Snapshot): Comparison {
  const cur = computeMetrics(live);
  const next = computeMetrics(scen);
  const a = new Map<string, EmployeeLoad>(cur.people.map((p) => [p.name, p]));
  const b = new Map<string, EmployeeLoad>(next.people.map((p) => [p.name, p]));
  const names = [...new Set([...a.keys(), ...b.keys()])];
  const people = names
    .map((name) => ({
      name,
      before: a.get(name)?.load ?? 0,
      after: b.get(name)?.load ?? 0,
      hoursBefore: a.get(name)?.hours ?? 0,
      hoursAfter: b.get(name)?.hours ?? 0,
    }))
    .sort((x, y) => y.after - x.after || x.name.localeCompare(y.name, 'az'));
  const changed = people.filter((p) => Math.abs(p.hoursAfter - p.hoursBefore) > 1e-6 || Math.abs(p.after - p.before) > 1e-6);
  return { cur, next, people, changed };
}

/** Siyahı üçün qısa təsir: Δ lazım olan FTE, Δ normanı aşanlar, Δ iş həcmi. */
export function impactOf(live: Snapshot, changes: readonly ScenarioChange[]) {
  const c = compare(live, scenarioData(live, changes));
  return {
    dFte: c.next.fteNeed - c.cur.fteNeed,
    dHave: c.next.fteHave - c.cur.fteHave,
    dOver: c.next.over.length - c.cur.over.length,
    dHours: c.next.totalHours - c.cur.totalHours,
  };
}

/* ---------- tətbiq: ziddiyyət yoxlaması və jurnal ---------- */
const same = (a: unknown, b: unknown) => (a === '' || a == null ? null : a) === (b === '' || b == null ? null : b);

export type ApplyConflict = {
  changeId: string;
  label: string;
  table: 'Tasks' | 'Employees';
  key: string;
  /** Sahə → [ssenari yaradılanda, indi] */
  fields: Record<string, [Scalar, Scalar]>;
  reason: 'changed' | 'deleted' | 'exists';
};

/**
 * Ssenari yaradılandan sonra canlı datada dəyişmiş sənədləri tapır (SPEC §6.5 "ziddiyyət yoxlaması").
 * `base` olan op: sənəd silinibsə və ya base sahələrindən biri fərqlidirsə → ziddiyyət.
 * `base`-siz op (yeni sənəd): eyni açarla sənəd artıq varsa → ziddiyyət.
 */
export function findConflicts(live: Snapshot, changes: readonly ScenarioChange[]): ApplyConflict[] {
  const out: ApplyConflict[] = [];
  const created = new Set<string>();
  for (const c of changes)
    for (const op of c.ops) {
      if (op.table === 'Settings') continue;
      const key = String(op.table === 'Tasks' ? op.row.id : op.row.name);
      const id = `${op.table}/${key}`;
      const doc = docOf(live, op) as Record<string, Scalar> | undefined;
      if (!op.base) {
        // Ssenarinin özü yaratdığı sənədə sonrakı dəyişikliklər base-siz də ola bilər
        if (doc && !created.has(id))
          out.push({ changeId: c.id, label: c.label, table: op.table, key, fields: {}, reason: 'exists' });
        created.add(id);
        continue;
      }
      if (!doc) {
        out.push({ changeId: c.id, label: c.label, table: op.table, key, fields: {}, reason: 'deleted' });
        continue;
      }
      const fields: Record<string, [Scalar, Scalar]> = {};
      for (const [f, b] of Object.entries(op.base)) if (!same(doc[f], b)) fields[f] = [b, doc[f] ?? null];
      if (Object.keys(fields).length)
        out.push({ changeId: c.id, label: c.label, table: op.table, key, fields, reason: 'changed' });
    }
  return out;
}

/** Tətbiqdə yaranan jurnal qeydləri: başlıq + hər dəyişən tapşırıq/əməkdaş üzrə alt qeyd. */
export function applyLogs(name: string, live: Snapshot, target: Snapshot): Partial<LogEntry>[] {
  const logs: Partial<LogEntry>[] = [];
  const prev = new Map<string, TaskDoc>(live.tasks.map((t) => [t.id, t]));
  for (const t of target.tasks) {
    const p = prev.get(t.id);
    const label = taskLabel(t);
    const comment = `Ssenari: ${name}`;
    if (!p) {
      logs.push({ action: 'Yeni', task_id: t.id, task_label: label, to: curOwner(t), comment });
      continue;
    }
    if (curOwner(p) !== curOwner(t))
      logs.push({ action: 'Ötürmə', task_id: t.id, task_label: label, from: curOwner(p), to: curOwner(t), comment });
    if (p.is_cancelled !== t.is_cancelled)
      logs.push({ action: t.is_cancelled ? 'Ləğv' : 'Bərpa', task_id: t.id, task_label: label, from: curOwner(t), comment });
    if (p.hours !== t.hours)
      logs.push({ action: 'Düzəliş', task_id: t.id, task_label: `${label}: ${fmtH(p.hours)} → ${fmtH(t.hours)} saat`, comment });
  }
  const pe = new Map<string, EmployeeDoc>(live.employees.map((e) => [e.name, e]));
  for (const e of target.employees) {
    const p = pe.get(e.name);
    if (!p) logs.push({ action: 'Əməkdaş', task_label: `${e.name} əlavə edildi`, comment: `Ssenari: ${name}` });
    else if (p.active !== e.active || p.fte !== e.fte)
      logs.push({ action: 'Əməkdaş', task_label: `${e.name} profili yeniləndi`, comment: `Ssenari: ${name}` });
  }
  if (live.settings.norm !== target.settings.norm)
    logs.push({ action: 'Ayarlar', task_label: `Norma: ${target.settings.norm} saat`, comment: `Ssenari: ${name}` });
  return [{ action: 'Ssenari', task_label: `Ssenari: ${name} tətbiq edildi (${logs.length} dəyişiklik)` }, ...logs];
}

/** Ötürmə dəyişikliyinin saatı (təsdiq həddi üçün). */
export const transferHours = (live: Snapshot, changes: readonly ScenarioChange[]) => {
  let h = 0;
  for (const op of scenarioOps(changes))
    if (op.table === 'Tasks' && 'owner_after' in op.row) {
      const t = live.tasks.find((x) => x.id === op.row.id);
      if (t && curOwner(t) !== op.row.owner_after) h += effHours(t);
    }
  return h;
};
