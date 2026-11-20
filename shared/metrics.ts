// Analitika formulaları — TƏK MƏNBƏ (SPEC §7). Rəhbərliyə gedən hər rəqəm buradan hesablanır.
// Formulanı dəyişmək sahibin razılığını tələb edir (CLAUDE.md §9) və tests/golden/seed.test.ts ilə yoxlanır.
import { ACT_ADMIN } from './constants.js';
import type { Settings } from './schema.js';
import { curOwner, type EmployeeDoc, type TaskDoc } from './model.js';

export type View = 'current' | 'opt';
export type Filters = { company?: string | null; activity?: string | null };
export type LoadLevel = 'critical' | 'warning' | 'idle' | 'good';

/** v2 sahələri (Mərhələ 7+) — hələ datada olmaya bilər. */
type TaskExt = TaskDoc & { automation?: 'none' | 'candidate' | 'in_progress' | 'done' };
type EmployeeExt = EmployeeDoc & { capacity_overrides?: Record<string, number> };
export type Absence = { employee: string; hours: number; year?: number };

export type MetricsInput = {
  tasks: TaskExt[];
  employees: EmployeeExt[];
  settings: Settings;
  year?: number;
  absences?: Absence[];
};

export type EmployeeLoad = {
  name: string;
  /** Əməkdaş siyahısında var (yoxdursa "sahibsiz iş" — v1 kimi 1 ştat ilə göstərilir, mövcud ştata düşmür) */
  known: boolean;
  company: string;
  activity: string;
  isGroup: boolean;
  active: boolean;
  fte: number;
  hours: number;
  tasks: number;
  /** Effektiv tutum, saat (§7.3) */
  cap: number;
  /** Yük, 0..∞ (§7.4) */
  load: number;
  level: LoadLevel;
};

export type Metrics = {
  norm: number;
  activeTasks: number;
  /** §7.2 İllik iş həcmi (görünüşə görə) */
  totalHours: number;
  /** §7.5 */
  fteNeed: number;
  fteHave: number;
  gap: number;
  /** Aktiv işi olan, qrup olmayan, aktiv əməkdaşlar */
  people: EmployeeLoad[];
  /** Cari icraçıların hamısı (qruplar daxil) */
  loads: EmployeeLoad[];
  over: EmployeeLoad[];
  /** §7.6 */
  cancelled: { count: number; hours: number };
  /** §7.7 */
  transfers: { count: number; hours: number };
  /** §7.8 */
  optPotential: number;
  byCompany: Record<string, number>;
  byActivity: Record<string, number>;
  /** §7.11 */
  singleOwnerRisks: { process: string; owner: string; hours: number }[];
};

/** §7.1 Effektiv saat */
export const effHours = (t: TaskExt, view: View = 'current') =>
  (view === 'opt' && t.after_opt != null ? t.after_opt : t.hours) || 0;

/** §7.4 Səviyyə */
export function levelOf(load: number, warnPct: number): LoadLevel {
  if (load > 1) return 'critical';
  if (load > warnPct / 100) return 'warning';
  if (load === 0) return 'idle';
  return 'good';
}

/** Filtrə uyğun tapşırıqlar (§7.2: fəaliyyət forması cari icraçının profilindən). Panel qrafikləri də bunu işlədir. */
export function filterScope(input: Pick<MetricsInput, 'tasks' | 'employees'>, filters: Filters = {}) {
  const emp = new Map(input.employees.map((e) => [e.name, e]));
  const activityOf = (name: string) => emp.get(name)?.activity ?? ACT_ADMIN;
  const scope = input.tasks.filter(
    (t) =>
      (!filters.company || t.company === filters.company) && (!filters.activity || activityOf(curOwner(t)) === filters.activity),
  );
  return { emp, activityOf, scope, active: scope.filter((t) => !t.is_cancelled) };
}

export function computeMetrics(
  input: MetricsInput,
  { view = 'current', filters = {} }: { view?: View; filters?: Filters } = {},
): Metrics {
  const { settings } = input;
  const N = settings.norm;
  const year = input.year ?? new Date().getFullYear();
  const { emp, activityOf, scope, active } = filterScope(input, filters);

  // §7.3 Tutum
  const absenceHours = new Map<string, number>();
  for (const a of input.absences ?? [])
    if (a.year == null || a.year === year) absenceHours.set(a.employee, (absenceHours.get(a.employee) ?? 0) + a.hours);
  const capOf = (e: EmployeeExt | undefined) => {
    const fte = e ? e.fte : 1;
    const override = e?.capacity_overrides?.[String(year)] ?? 1;
    return Math.max(0, N * fte * override - (e ? (absenceHours.get(e.name) ?? 0) : 0));
  };

  // §7.4 Yük — cari icraçı üzrə
  const rows = new Map<string, { hours: number; tasks: number }>();
  let totalHours = 0;
  for (const t of active) {
    const h = effHours(t, view);
    totalHours += h;
    const o = curOwner(t);
    if (!o) continue;
    const r = rows.get(o) ?? { hours: 0, tasks: 0 };
    r.hours += h;
    r.tasks++;
    rows.set(o, r);
  }
  const loads: EmployeeLoad[] = [...rows].map(([name, r]) => {
    const e = emp.get(name);
    const cap = capOf(e);
    const load = cap > 0 ? r.hours / cap : r.hours > 0 ? Infinity : 0;
    return {
      name,
      known: !!e,
      company: e?.company ?? '',
      activity: e?.activity ?? ACT_ADMIN,
      isGroup: !!e?.is_group,
      active: e ? e.active : true,
      fte: e ? e.fte : 1,
      hours: r.hours,
      tasks: r.tasks,
      cap,
      load,
      level: levelOf(load, settings.warn),
    };
  });
  // §7.5 Mövcud ştat: aktiv işi olan, qrup olmayan, aktiv əməkdaşlar (siyahıda olanlar)
  const people = loads.filter((r) => r.known && !r.isGroup && r.active && r.hours > 0);
  const fteHave = people.reduce((s, r) => s + r.fte, 0);
  const fteNeed = totalHours / N;

  // §7.6
  const cancelledList = scope.filter((t) => t.is_cancelled);
  // §7.7
  const transferList = active.filter((t) => t.owner_before && t.owner_after && t.owner_before !== t.owner_after);
  // §7.8
  const optPotential = active
    .filter((t) => t.after_opt != null && t.automation !== 'done')
    .reduce((s, t) => s + ((t.hours || 0) - (t.after_opt as number)), 0);

  const byCompany: Record<string, number> = {};
  const byActivity: Record<string, number> = {};
  const byProcess = new Map<string, { hours: number; owners: Set<string> }>();
  for (const t of active) {
    const h = effHours(t, view);
    byCompany[t.company] = (byCompany[t.company] ?? 0) + h;
    const act = activityOf(curOwner(t));
    byActivity[act] = (byActivity[act] ?? 0) + h;
    const p = byProcess.get(t.process) ?? { hours: 0, owners: new Set<string>() };
    p.hours += h;
    p.owners.add(curOwner(t));
    byProcess.set(t.process, p);
  }
  // §7.11 Tək icraçı riski
  const singleOwnerRisks = [...byProcess]
    .filter(([, p]) => p.owners.size === 1 && p.hours >= 100)
    .map(([process, p]) => ({ process, owner: [...p.owners][0], hours: p.hours }))
    .sort((a, b) => b.hours - a.hours);

  return {
    norm: N,
    activeTasks: active.length,
    totalHours,
    fteNeed,
    fteHave,
    gap: fteHave - fteNeed,
    people,
    loads,
    over: people.filter((r) => r.load > 1).sort((a, b) => b.load - a.load),
    cancelled: { count: cancelledList.length, hours: cancelledList.reduce((s, t) => s + (t.hours || 0), 0) },
    transfers: { count: transferList.length, hours: transferList.reduce((s, t) => s + effHours(t, view), 0) },
    optPotential,
    byCompany,
    byActivity,
    singleOwnerRisks,
  };
}
