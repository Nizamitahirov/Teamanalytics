// Optimizasiya portfeli (SPEC §6.6). Saf funksiyalar; rəqəmlər shared/metrics.ts ilə eyni qaydada (§7.8).
import { realizedSaving } from './metrics.js';
import type { Automation, TaskDoc } from './model.js';

export const COLUMNS = ['candidate', 'in_progress', 'done', 'rejected'] as const satisfies readonly Automation[];
export type Column = (typeof COLUMNS)[number];

/** "Avtomatlaşdırma üçün yaxşı namizəd": hədəf saat var, ildə ≥ 500 dəfə, 1 əməliyyat ≤ 10 dəq. */
export const isGoodCandidate = (t: Pick<TaskDoc, 'after_opt' | 'annual_freq' | 'min_per_key'>) =>
  t.after_opt != null && (t.annual_freq ?? 0) >= 500 && t.min_per_key != null && t.min_per_key > 0 && t.min_per_key <= 10;

/** Yüksək təkrarlı, qısa iş — hələ portfeldə deyil (hədəf saat təyin etmək təklif olunur). */
export const isSuggested = (t: TaskDoc) =>
  !t.is_cancelled &&
  (t.automation ?? 'none') === 'none' &&
  (t.annual_freq ?? 0) >= 500 &&
  t.min_per_key != null &&
  t.min_per_key > 0 &&
  t.min_per_key <= 10;

/** Planlaşdırılan qənaət: `hours − after_opt` (tamamlanıb saat əvəz olunubsa — köhnə saatdan). */
export const plannedSaving = (t: TaskDoc) =>
  t.automation === 'done' ? realizedSaving(t) : t.after_opt != null ? Math.max(0, (t.hours || 0) - t.after_opt) : 0;

export const quarterOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
};

export type Portfolio = {
  columns: Record<Column, TaskDoc[]>;
  inProgress: { count: number; hours: number };
  /** Rüblər üzrə plan (hədəf rübü olan aktiv portfel işlərinin planlaşdırılan qənaəti) vs fakt (tamamlananlar) */
  quarters: { quarter: string; plan: number; fact: number }[];
  suggested: TaskDoc[];
};

export function portfolio(tasks: readonly TaskDoc[]): Portfolio {
  const columns: Portfolio['columns'] = { candidate: [], in_progress: [], done: [], rejected: [] };
  const q = new Map<string, { plan: number; fact: number }>();
  for (const t of tasks) {
    if (t.is_cancelled) continue;
    const a = t.automation ?? 'none';
    if (a === 'none') continue;
    columns[a].push(t);
    if (a === 'rejected') continue;
    const quarter = t.due_quarter || (a === 'done' ? quarterOf(t.opt_done_at ?? '') : '');
    if (!quarter) continue;
    const r = q.get(quarter) ?? { plan: 0, fact: 0 };
    r.plan += plannedSaving(t);
    if (a === 'done') r.fact += realizedSaving(t);
    q.set(quarter, r);
  }
  const bySaving = (x: TaskDoc, y: TaskDoc) => plannedSaving(y) - plannedSaving(x) || x.id.localeCompare(y.id);
  for (const c of COLUMNS) columns[c].sort(bySaving);
  return {
    columns,
    inProgress: { count: columns.in_progress.length, hours: columns.in_progress.reduce((s, t) => s + plannedSaving(t), 0) },
    quarters: [...q].map(([quarter, v]) => ({ quarter, ...v })).sort((x, y) => x.quarter.localeCompare(y.quarter)),
    suggested: tasks.filter(isSuggested).sort((x, y) => y.hours - x.hours),
  };
}

/** Növbəti N rüb (seçim siyahısı üçün) */
export function nextQuarters(from = new Date(), n = 8): string[] {
  const out: string[] = [];
  let y = from.getUTCFullYear();
  let k = Math.floor(from.getUTCMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-Q${k}`);
    if (++k > 4) {
      k = 1;
      y++;
    }
  }
  return out;
}
