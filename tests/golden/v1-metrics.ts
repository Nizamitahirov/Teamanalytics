// v1 panel formulalarının (public/app.js → filteredActive, employeeLoads, renderDashboard) birbaşa TS köçürməsi.
// Məqsəd: Mərhələ 1-də qızıl rəqəmləri (SPEC §13.2) v1 məntiqinə qarşı təsdiqləmək.
// Mərhələ 2-də eyni test shared/metrics.ts-ə qarşı işləyəcək; bu fayl müqayisə üçün etalon kimi qalır.
// QAYDA: bu faylı "yaxşılaşdırma" — v1-in davranışını olduğu kimi əks etdirməlidir (CLAUDE.md §5).
import { ACT_ADMIN } from '../../shared/schema.js';

export type V1Task = {
  id: string;
  company: string;
  process: string;
  owner_before: string;
  owner_after: string;
  hours: number;
  after_opt: number | null;
  is_cancelled: boolean;
};
export type V1Employee = { name: string; company: string; activity: string; fte: number; is_group: boolean };
export type V1State = { tasks: V1Task[]; employees: V1Employee[]; settings: { norm: number; warn: number } };

const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const truthy = (v: unknown) => v === true || /^(true|bəli|1|yes)$/i.test(String(v ?? '').trim());

/** v1 normalizeTask/normalizeEmployee-nin hesablamaya təsir edən hissəsi. */
export function normalize(raw: { tasks: Record<string, unknown>[]; employees: Record<string, unknown>[] }): V1State {
  return {
    tasks: raw.tasks.map((t) => ({
      id: String(t.id),
      company: String(t.company || 'Birbank'),
      process: String(t.process || '').trim(),
      owner_before: String(t.owner_before || '').trim(),
      owner_after: String(t.owner_after || '').trim(),
      hours: num(t.hours) ?? 0,
      after_opt: num(t.after_opt),
      is_cancelled: truthy(t.is_cancelled),
    })),
    employees: raw.employees
      .map((e) => ({
        name: String(e.name || '').trim(),
        company: String(e.company || 'Birbank'),
        activity: String(e.activity || ACT_ADMIN),
        fte: num(e.fte) ?? 1,
        is_group: truthy(e.is_group),
      }))
      .filter((e) => e.name),
    settings: { norm: 1922, warn: 85 },
  };
}

export const curOwner = (t: V1Task) => (t.owner_after || t.owner_before || '').trim();
export function statusOf(t: V1Task): 'Ləğv' | 'Yeni' | 'Transfer' | 'Mövcud' {
  if (t.is_cancelled) return 'Ləğv';
  if (!t.owner_before && t.owner_after) return 'Yeni';
  if (t.owner_after && t.owner_before && t.owner_after !== t.owner_before) return 'Transfer';
  return 'Mövcud';
}
const effHours = (t: V1Task, useOpt: boolean) => (useOpt && t.after_opt != null ? Number(t.after_opt) : Number(t.hours) || 0);

export type Filters = { company?: string; activity?: string; useOpt?: boolean };

export function computeV1(state: V1State, { company = 'all', activity = 'all', useOpt = false }: Filters = {}) {
  const activityOf = (name: string) => state.employees.find((x) => x.name === name)?.activity ?? ACT_ADMIN;
  const empByName = Object.fromEntries(state.employees.map((e) => [e.name, e]));
  const norm = state.settings.norm;
  const inScope = (t: V1Task) =>
    (company === 'all' || t.company === company) && (activity === 'all' || activityOf(curOwner(t)) === activity);
  const active = state.tasks.filter((t) => !t.is_cancelled && inScope(t));
  const scope = state.tasks.filter(inScope);

  // employeeLoads
  type Row = { name: string; hours: number; tasks: number; emp: V1Employee };
  const rows: Record<string, Row> = {};
  const add = (name: string) =>
    rows[name] ||
    (rows[name] = {
      name,
      hours: 0,
      tasks: 0,
      emp: empByName[name] || { name, fte: 1, activity: ACT_ADMIN, company: '', is_group: false },
    });
  active.forEach((t) => {
    const r = add(curOwner(t));
    r.hours += effHours(t, useOpt);
    r.tasks++;
  });
  const loads = Object.values(rows)
    .filter((r) => r.name)
    .map((r) => {
      const fte = r.emp.fte || 1;
      const cap = norm * fte;
      return { name: r.name, hours: r.hours, tasks: r.tasks, fte, cap, load: r.hours / cap, isGroup: !!r.emp.is_group };
    });

  const totalH = active.reduce((s, t) => s + effHours(t, useOpt), 0);
  const cancelled = scope.filter((t) => t.is_cancelled);
  const cancelledH = cancelled.reduce((s, t) => s + (Number(t.hours) || 0), 0);
  const optSave = active
    .filter((t) => t.after_opt != null)
    .reduce((s, t) => s + ((Number(t.hours) || 0) - Number(t.after_opt)), 0);
  const transfers = scope.filter((t) => statusOf(t) === 'Transfer').length;
  const people = loads.filter((r) => !r.isGroup && r.hours > 0);
  const fteHave = people.reduce((s, r) => s + r.fte, 0);
  const fteNeed = totalH / norm;
  const over = people.filter((r) => r.load > 1).sort((a, b) => b.load - a.load);

  return {
    activeCount: active.length,
    totalH,
    fteNeed,
    fteHave,
    peopleCount: people.length,
    gap: fteHave - fteNeed,
    over,
    cancelledCount: cancelled.length,
    cancelledH,
    transfers,
    optSave,
    loads,
  };
}
