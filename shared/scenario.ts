// Ssenari dəyişiklikləri (SPEC §6.5): hər dəyişiklik = etiket + baza vəziyyətinə nisbətən Op[] (diffOps).
// Ssenari datası = cari (canlı) data + bütün dəyişikliklərin op-larının lokal tətbiqi (shared/apply.ts).
// Saf funksiyalar — canlı dataya heç nə yazmır.
import { ACT_ADMIN } from './constants.js';
import { applyOpsLocal, type Snapshot } from './apply.js';
import { computeMetrics, type Metrics } from './metrics.js';
import { curOwner, diffOps, normalizeTask, type EmployeeDoc, type TaskDoc } from './model.js';
import type { RebalanceResult } from './rebalance.js';
import type { ChangeKind, Op, ScenarioChange, ScenarioSummary } from './schema.js';

export const newScenarioId = () => 'S-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
export const newChangeId = () => 'C-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** Ssenarinin vəziyyəti: canlı data + dəyişikliklər (sıra ilə). */
export function scenarioState(live: Snapshot, changes: readonly ScenarioChange[]): Snapshot {
  return applyOpsLocal(
    live,
    changes.flatMap((c) => c.ops),
  );
}

/** Dəyişikliyin op-ları: `before` → `after` fərqi (yalnız dəyişən sahələr + v/base). */
export function makeChange(kind: ChangeKind, label: string, before: Snapshot, after: Snapshot): ScenarioChange | null {
  const ops: Op[] = diffOps(before, after);
  return ops.length ? { id: newChangeId(), kind, label, ops } : null;
}

/* ---------- vəziyyət çeviriciləri (immutable) ---------- */
const now = () => new Date().toISOString();

function withEmployee(s: Snapshot, name: string, company: string): EmployeeDoc[] {
  if (!name || s.employees.some((e) => e.name === name)) return s.employees;
  return [
    ...s.employees,
    { name, company: company || 'Birbank', activity: ACT_ADMIN, fte: 1, is_group: false, active: true, _v: 0 },
  ];
}

export function transferIn(s: Snapshot, ids: readonly string[], to: string): Snapshot {
  const set = new Set(ids);
  const ts = now();
  const first = s.tasks.find((t) => set.has(t.id));
  return {
    ...s,
    employees: withEmployee(s, to, first?.company ?? ''),
    tasks: s.tasks.map((t) =>
      set.has(t.id) && curOwner(t) !== to
        ? { ...t, owner_before: t.owner_before || curOwner(t), owner_after: to, updated_at: ts }
        : t,
    ),
  };
}

export function cancelIn(s: Snapshot, ids: readonly string[], value: boolean): Snapshot {
  const set = new Set(ids);
  const ts = now();
  return {
    ...s,
    tasks: s.tasks.map((t) => (set.has(t.id) && t.is_cancelled !== value ? { ...t, is_cancelled: value, updated_at: ts } : t)),
  };
}

export function hoursIn(s: Snapshot, id: string, hours: number): Snapshot {
  const ts = now();
  return { ...s, tasks: s.tasks.map((t) => (t.id === id && t.hours !== hours ? { ...t, hours, updated_at: ts } : t)) };
}

export function newTaskIn(s: Snapshot, task: Partial<TaskDoc> & { id: string }, owner: string): Snapshot {
  const t = { ...normalizeTask({ ...task, owner_before: '', owner_after: owner, updated_at: now() }), _v: 0 };
  return { ...s, employees: withEmployee(s, owner, t.company), tasks: [...s.tasks, t] };
}

export function addEmployeeIn(s: Snapshot, e: Omit<EmployeeDoc, '_v'>): Snapshot {
  if (s.employees.some((x) => x.name === e.name)) return s;
  return { ...s, employees: [...s.employees, { ...e, _v: 0 }] };
}

export function fteIn(s: Snapshot, name: string, fte: number): Snapshot {
  return { ...s, employees: s.employees.map((e) => (e.name === name && e.fte !== fte ? { ...e, fte } : e)) };
}

export function normIn(s: Snapshot, norm: number): Snapshot {
  return { ...s, settings: { ...s.settings, norm } };
}

/** "Prosesi avtomatlaşdır (−X%)": prosesin aktiv işlərinin saatı azalır. */
export function automateIn(s: Snapshot, process: string, pct: number, company?: string): Snapshot {
  const k = Math.max(0, Math.min(1, 1 - pct / 100));
  const ts = now();
  return {
    ...s,
    tasks: s.tasks.map((t) =>
      t.process === process && !t.is_cancelled && (!company || t.company === company)
        ? { ...t, hours: Math.round(t.hours * k * 100) / 100, updated_at: ts }
        : t,
    ),
  };
}

/**
 * "Əməkdaş ayrılır": profil aktiv deyil olur, aktiv işləri `to`-ya və ya (to boşdursa) eyni şirkətin
 * ən az yüklü əməkdaşlarına (böyük işlər əvvəl, hər dəfə ən aşağı "sonra" yükü) paylanır.
 */
export function removeEmployeeIn(s: Snapshot, name: string, to = ''): Snapshot {
  const out: Snapshot = { ...s, employees: s.employees.map((e) => (e.name === name ? { ...e, active: false } : e)) };
  const mine = s.tasks.filter((t) => !t.is_cancelled && curOwner(t) === name);
  if (!mine.length) return out;
  if (to)
    return transferIn(
      out,
      mine.map((t) => t.id),
      to,
    );
  const m = computeMetrics({ ...out, tasks: out.tasks });
  const hours = new Map(m.loads.map((l) => [l.name, l.hours]));
  const pool = out.employees.filter((e) => e.active && !e.is_group && e.fte > 0 && e.name !== name);
  let cur = out;
  for (const t of [...mine].sort((a, b) => b.hours - a.hours || a.id.localeCompare(b.id))) {
    const cands = pool.filter((e) => e.company === t.company);
    const list = cands.length ? cands : pool;
    if (!list.length) break;
    let best = list[0];
    let bestLoad = Infinity;
    for (const e of list) {
      const l = ((hours.get(e.name) ?? 0) + t.hours) / (s.settings.norm * e.fte);
      if (l < bestLoad - 1e-9 || (Math.abs(l - bestLoad) <= 1e-9 && e.name.localeCompare(best.name, 'az') < 0)) {
        best = e;
        bestLoad = l;
      }
    }
    hours.set(best.name, (hours.get(best.name) ?? 0) + t.hours);
    cur = transferIn(cur, [t.id], best.name);
  }
  return cur;
}

/** Balanslama nəticəsi (§8) → ötürmələr. */
export function rebalanceIn(s: Snapshot, r: RebalanceResult): Snapshot {
  let cur = s;
  for (const m of r.moves) cur = transferIn(cur, [m.taskId], m.to);
  return cur;
}

/* ---------- təsir (müqayisə) ---------- */
export type ScenarioImpact = {
  base: Metrics;
  next: Metrics;
  summary: ScenarioSummary;
  /** Yükü dəyişən əməkdaşlar: ad, əvvəl, sonra */
  changed: { name: string; before: number; after: number; hoursBefore: number; hoursAfter: number }[];
};

export function scenarioImpact(live: Snapshot, changes: readonly ScenarioChange[]): ScenarioImpact {
  const next = scenarioState(live, changes);
  const base = computeMetrics(live);
  const nm = computeMetrics(next);
  const b = new Map(base.loads.map((l) => [l.name, l]));
  const a = new Map(nm.loads.map((l) => [l.name, l]));
  const names = new Set([...b.keys(), ...a.keys()]);
  const changed: ScenarioImpact['changed'] = [];
  for (const name of names) {
    const x = b.get(name);
    const y = a.get(name);
    const hb = x?.hours ?? 0;
    const ha = y?.hours ?? 0;
    const lb = x?.load ?? 0;
    const la = y?.load ?? 0;
    if (Math.abs(hb - ha) > 1e-9 || Math.abs(lb - la) > 1e-9)
      changed.push({ name, before: lb, after: la, hoursBefore: hb, hoursAfter: ha });
  }
  changed.sort((p, q) => Math.abs(q.after - q.before) - Math.abs(p.after - p.before) || p.name.localeCompare(q.name, 'az'));
  return {
    base,
    next: nm,
    changed,
    summary: {
      changes: changes.length,
      dFteNeed: nm.fteNeed - base.fteNeed,
      dOver: nm.over.length - base.over.length,
      dHours: nm.totalHours - base.totalHours,
    },
  };
}
