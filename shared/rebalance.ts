// Yükü balanslama tövsiyəsi (SPEC §8) — deterministik greedy. Saf funksiya: heç nə yazmır;
// nəticə həmişə ssenari kimi açılır (UI heç vaxt birbaşa tətbiq etmir).
import { capacityFn, type Absence } from './metrics.js';
import { curOwner, type EmployeeDoc, type TaskDoc } from './model.js';
import type { Settings } from './schema.js';

/** Qəbul edənin yükü həddən bu qədər aşağı qalmalıdır (5% bufer) */
export const REBALANCE_BUFFER = 0.05;

type TaskIn = TaskDoc & { eligible?: string[] };
type EmpIn = EmployeeDoc & { skills?: string[]; capacity_overrides?: Record<string, number> };

export type RebalanceOptions = {
  /** Hədd θ (1 = norma, 0,85 = yüksək yük həddi) */
  threshold?: number;
  /** Yalnız eyni şirkət daxilində (default açıq — SPEC §18 S3) */
  sameCompany?: boolean;
  /** Yalnız eyni fəaliyyət forması (default söndürülü) */
  sameActivity?: boolean;
  /** Toxunulmayan (kilidli) tapşırıqlar */
  locked?: readonly string[];
  year?: number;
  absences?: Absence[];
};

export type RebalanceMove = {
  taskId: string;
  task: string;
  process: string;
  company: string;
  hours: number;
  from: string;
  to: string;
  /** Ötürmə anında (ardıcıl) yüklər */
  fromBefore: number;
  fromAfter: number;
  toBefore: number;
  toAfter: number;
};

export type RebalanceResult = {
  threshold: number;
  moves: RebalanceMove[];
  /** Ad → yük (əvvəl / sonra), yalnız iştirak edən əməkdaşlar */
  before: Record<string, number>;
  after: Record<string, number>;
  /** Həll olunmayan qalıq: yeni ştat və ya optimizasiya lazımdır */
  shortfalls: { name: string; hours: number; load: number }[];
  donors: string[];
};

const byName = (a: string, b: string) => a.localeCompare(b, 'az');
const EPS = 1e-9;

export function rebalance(
  input: { tasks: readonly TaskIn[]; employees: readonly EmpIn[]; settings: Settings },
  opts: RebalanceOptions = {},
): RebalanceResult {
  const θ = opts.threshold ?? 1;
  const limit = θ - REBALANCE_BUFFER;
  const sameCompany = opts.sameCompany ?? true;
  const sameActivity = opts.sameActivity ?? false;
  const locked = new Set(opts.locked ?? []);
  const year = opts.year ?? new Date().getFullYear();
  const capOf = capacityFn({ settings: input.settings, absences: opts.absences }, year);

  // Yalnız aktiv, qrup olmayan, tutumu olan əməkdaşlar iştirak edir
  const people = input.employees.filter((e) => e.active && !e.is_group && capOf(e) > 0);
  const st = new Map(
    people.map((e) => [e.name, { e, cap: capOf(e), hours: 0, processes: new Set<string>(), tasks: [] as TaskIn[] }]),
  );
  for (const t of input.tasks) {
    if (t.is_cancelled) continue;
    const p = st.get(curOwner(t));
    if (!p) continue;
    p.hours += t.hours || 0;
    p.processes.add(t.process);
    p.tasks.push(t);
  }
  const loadOf = (name: string) => {
    const p = st.get(name)!;
    return p.hours / p.cap;
  };
  const before: Record<string, number> = {};
  for (const name of st.keys()) before[name] = loadOf(name);

  const donors = [...st.keys()].filter((n) => loadOf(n) > θ + EPS).sort((a, b) => loadOf(b) - loadOf(a) || byName(a, b));
  const moves: RebalanceMove[] = [];
  const shortfalls: RebalanceResult['shortfalls'] = [];

  for (const donor of donors) {
    const d = st.get(donor)!;
    const queue = d.tasks
      .filter((t) => !locked.has(t.id) && (t.hours || 0) > 0)
      .sort((a, b) => a.hours - b.hours || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const t of queue) {
      if (loadOf(donor) <= θ + EPS) break;
      let best: { name: string; after: number; knows: boolean } | null = null;
      for (const [name, r] of st) {
        if (name === donor) continue;
        if (sameCompany && r.e.company !== t.company) continue;
        if (sameActivity && r.e.activity !== d.e.activity) continue;
        if (t.eligible?.length && !t.eligible.includes(name)) continue;
        if (r.e.skills?.length && !r.e.skills.includes(t.process)) continue;
        const after = (r.hours + t.hours) / r.cap;
        if (after > limit + EPS) continue;
        const knows = r.processes.has(t.process);
        // Ən aşağı "sonra" yükü; bərabərlikdə prosesi artıq görən (bilik davamlılığı), sonra ad
        if (
          !best ||
          after < best.after - EPS ||
          (Math.abs(after - best.after) <= EPS && (knows !== best.knows ? knows : byName(name, best.name) < 0))
        )
          best = { name, after, knows };
      }
      if (!best) continue;
      const r = st.get(best.name)!;
      const fromBefore = loadOf(donor);
      const toBefore = loadOf(best.name);
      d.hours -= t.hours;
      r.hours += t.hours;
      r.processes.add(t.process);
      moves.push({
        taskId: t.id,
        task: t.task,
        process: t.process,
        company: t.company,
        hours: t.hours,
        from: donor,
        to: best.name,
        fromBefore,
        fromAfter: loadOf(donor),
        toBefore,
        toAfter: loadOf(best.name),
      });
    }
    if (loadOf(donor) > θ + EPS) shortfalls.push({ name: donor, hours: d.hours - θ * d.cap, load: loadOf(donor) });
  }

  const involved = new Set(moves.flatMap((m) => [m.from, m.to]).concat(donors));
  const pick = (rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).filter(([n]) => involved.has(n)));
  const after: Record<string, number> = {};
  for (const name of st.keys()) after[name] = loadOf(name);
  return { threshold: θ, moves, before: pick(before), after: pick(after), shortfalls, donors };
}
