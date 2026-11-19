// Tapşırıq filtrləri (SPEC §6.4): sütun filtrləri + sürətli çiplər + axtarış. URL-də saxlanılır.
import { curOwner, statusOf, type EmployeeDoc, type Status, type TaskDoc } from './model.js';
import { matches } from './search.js';
import { ACT_ADMIN } from './constants.js';

export const QUICK = ['transfers', 'cancelled', 'over', 'mismatch'] as const;
export type Quick = (typeof QUICK)[number];

export type TaskFilter = {
  q?: string;
  company?: string;
  process?: string;
  owner?: string;
  status?: Status | '';
  activity?: string;
  quick?: Quick | '';
};

/** Saat uyğunsuzluğu: dəqiqə və təkrar dolu, |hours − m×f/60| / hours > 5% (SPEC §6.8). */
export const isMismatch = (t: TaskDoc) =>
  t.min_per_key != null &&
  t.annual_freq != null &&
  t.hours > 0 &&
  Math.abs(t.hours - (t.min_per_key * t.annual_freq) / 60) / t.hours > 0.05;

export function filterTasks(
  tasks: TaskDoc[],
  employees: EmployeeDoc[],
  f: TaskFilter,
  overNames: Set<string> = new Set(),
): TaskDoc[] {
  const act = new Map(employees.map((e) => [e.name, e.activity]));
  return tasks.filter((t) => {
    if (f.company && t.company !== f.company) return false;
    if (f.process && t.process !== f.process) return false;
    if (f.owner && curOwner(t) !== f.owner) return false;
    if (f.status && statusOf(t) !== f.status) return false;
    if (f.activity && (act.get(curOwner(t)) ?? ACT_ADMIN) !== f.activity) return false;
    if (f.quick === 'transfers' && statusOf(t) !== 'Transfer') return false;
    if (f.quick === 'cancelled' && !t.is_cancelled) return false;
    if (f.quick === 'over' && (t.is_cancelled || !overNames.has(curOwner(t)))) return false;
    if (f.quick === 'mismatch' && !isMismatch(t)) return false;
    if (f.q && !matches(`${t.task} ${t.process} ${t.category} ${t.description} ${t.owner_before} ${t.owner_after} ${t.id}`, f.q))
      return false;
    return true;
  });
}
