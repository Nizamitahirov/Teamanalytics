// Panel vidjetlərinin datası (SPEC §6.2) — saf funksiyalar, shared/metrics.ts üzərində.
// Qrafik kitabxanasından asılı deyil: src/charts/options/*.ts bunları ECharts option-a çevirir.
import { ACT_ADMIN, ACT_PROJECT } from './constants.js';
import { curOwner, type TaskDoc } from './model.js';
import {
  computeMetrics,
  effHours,
  filterScope,
  type EmployeeLoad,
  type Filters,
  type Metrics,
  type MetricsInput,
  type View,
  realizedSaving,
} from './metrics.js';
import type { LogEntry } from './schema.js';

export type DashOpts = { view?: View; filters?: Filters };

/* ---------- 3. Tutum balansı (bullet) ---------- */
export function capacityBalance(input: MetricsInput, filters: Filters = {}) {
  const cur = computeMetrics(input, { filters });
  const opt = computeMetrics(input, { filters, view: 'opt' });
  return { need: cur.fteNeed, have: cur.fteHave, needOpt: opt.fteNeed, max: Math.max(cur.fteNeed, cur.fteHave, opt.fteNeed) };
}

/* ---------- 4. Əməkdaşların yüklənməsi ---------- */
export function loadBars(m: Metrics, { groups = false } = {}): EmployeeLoad[] {
  return m.loads
    .filter((l) => (groups ? true : !l.isGroup) && l.known !== false)
    .sort((a, b) => Number(a.isGroup) - Number(b.isGroup) || b.load - a.load || a.name.localeCompare(b.name, 'az'));
}

/* ---------- 5. Ötürmə axını (Sankey) ---------- */
export type Flow = { from: string; to: string; hours: number; count: number };
/** Yalnız Transfer statuslu aktiv işlər; çəki = effektiv saat (§7.7). */
export function transferFlows(input: MetricsInput, { view = 'current', filters = {} }: DashOpts = {}): Flow[] {
  const { active } = filterScope(input, filters);
  const map = new Map<string, Flow>();
  for (const t of active) {
    if (!(t.owner_before && t.owner_after && t.owner_before !== t.owner_after)) continue;
    const k = `${t.owner_before}\u0000${t.owner_after}`;
    const f = map.get(k) ?? { from: t.owner_before, to: t.owner_after, hours: 0, count: 0 };
    f.hours += effHours(t, view);
    f.count++;
    map.set(k, f);
  }
  return [...map.values()].sort((a, b) => b.hours - a.hours);
}

/* ---------- 6. İş həcminin strukturu (treemap) ---------- */
export type TreeNode = { name: string; value: number; children?: TreeNode[]; id?: string };
/** Şirkət → Proses → Kateqoriya → Tapşırıq; sahə = effektiv saat. */
export function workTree(input: MetricsInput, { view = 'current', filters = {} }: DashOpts = {}): TreeNode[] {
  const { active } = filterScope(input, filters);
  const root = new Map<string, Map<string, Map<string, TaskDoc[]>>>();
  for (const t of active) {
    const c = root.get(t.company) ?? new Map();
    root.set(t.company, c);
    const p = c.get(t.process || '—') ?? new Map();
    c.set(t.process || '—', p);
    const k = p.get(t.category || '—') ?? [];
    p.set(t.category || '—', k);
    k.push(t);
  }
  const sum = (xs: TreeNode[]) => xs.reduce((a, x) => a + x.value, 0);
  const sorted = (xs: TreeNode[]) => xs.sort((a, b) => b.value - a.value);
  return sorted(
    [...root].map(([company, procs]) => {
      const children = sorted(
        [...procs].map(([process, cats]) => {
          const pc = sorted(
            [...cats].map(([category, ts]) => {
              const leaves = sorted(ts.map((t) => ({ name: t.task, value: effHours(t, view), id: t.id })));
              return { name: category, value: sum(leaves), children: leaves };
            }),
          );
          return { name: process, value: sum(pc), children: pc };
        }),
      );
      return { name: company, value: sum(children), children };
    }),
  );
}

/* ---------- 7. Yük xəritəsi (heatmap) ---------- */
// Qalan proseslər sütunu — datada "Digər" adlı real proses olduğu üçün fərqli ad
export const OTHER = 'Qalan proseslər';
export function loadHeatmap(
  input: MetricsInput,
  m: Metrics,
  { view = 'current', filters = {}, topN = 15 }: DashOpts & { topN?: number } = {},
) {
  const { active } = filterScope(input, filters);
  const byProc = new Map<string, number>();
  for (const t of active) byProc.set(t.process, (byProc.get(t.process) ?? 0) + effHours(t, view));
  const top = [...byProc]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([p]) => p);
  const hasOther = byProc.size > top.length;
  const cols = hasOther ? [...top, OTHER] : top;
  const rows = loadBars(m).map((l) => l.name);
  const rowIdx = new Map(rows.map((r, i) => [r, i]));
  const colOf = (p: string) => (top.includes(p) ? top.indexOf(p) : cols.length - 1);
  const grid = rows.map(() => cols.map(() => 0));
  const owners = new Map<string, Set<string>>();
  for (const t of active) {
    const o = curOwner(t);
    const s = owners.get(t.process) ?? new Set<string>();
    s.add(o);
    owners.set(t.process, s);
    const r = rowIdx.get(o);
    if (r == null) continue;
    grid[r][colOf(t.process)] += effHours(t, view);
  }
  // Tək icraçılı proses (bus factor): §7.11-dəki kimi, amma burada saat həddi olmadan nişan
  const single = new Set(top.filter((p) => (owners.get(p)?.size ?? 0) === 1));
  const cells: [number, number, number][] = [];
  grid.forEach((row, r) => row.forEach((h, c) => cells.push([c, r, h])));
  return { rows, cols, cells, single, max: Math.max(0, ...cells.map((c) => c[2])) };
}

/* ---------- 8. Ləğv və optimizasiya (waterfall) ---------- */
export type Step = { key: string; value: number; kind: 'total' | 'minus' };
export function waterfall(input: MetricsInput, filters: Filters = {}): Step[] {
  const { scope, active } = filterScope(input, filters);
  // Realizə olunmuş optimizasiya (§7.8): yalnız saatı artıq əvəz olunmuş işlər (opt_before) körpüyə düşür —
  // başlanğıc cəm onların köhnə saatı ilə hesablanır ki, "hamısı − ləğv − realizə = cari" bərabərliyi qalsın.
  const realized = active
    .filter((t) => t.automation === 'done' && t.opt_before != null)
    .reduce((a, t) => a + realizedSaving(t), 0);
  const all = scope.reduce((a, t) => a + (t.hours || 0), 0) + realized;
  const cancelled = scope.filter((t) => t.is_cancelled).reduce((a, t) => a + (t.hours || 0), 0);
  const current = active.reduce((a, t) => a + (t.hours || 0), 0);
  const potential = computeMetrics(input, { filters }).optPotential;
  return [
    { key: 'all', value: all, kind: 'total' },
    { key: 'cancelled', value: cancelled, kind: 'minus' },
    { key: 'realized', value: realized, kind: 'minus' },
    { key: 'current', value: current, kind: 'total' },
    { key: 'potential', value: potential, kind: 'minus' },
    { key: 'target', value: current - potential, kind: 'total' },
  ];
}

/* ---------- 9. Pareto (proseslər) ---------- */
export function pareto(m: Metrics, input: MetricsInput, { view = 'current', filters = {} }: DashOpts = {}) {
  const { active } = filterScope(input, filters);
  const byProc = new Map<string, number>();
  for (const t of active) byProc.set(t.process, (byProc.get(t.process) ?? 0) + effHours(t, view));
  const total = [...byProc.values()].reduce((a, b) => a + b, 0) || 1;
  let cum = 0;
  const items = [...byProc]
    .sort((a, b) => b[1] - a[1])
    .map(([process, hours]) => {
      cum += hours;
      return { process, hours, cumPct: cum / total };
    });
  const n80 = items.findIndex((x) => x.cumPct >= 0.8) + 1;
  return { items, n80, total: m.totalHours };
}

/* ---------- 10. Yük paylanması (histogram) ---------- */
export function loadHistogram(m: Metrics, step = 0.1, max = 1.5) {
  const n = Math.round(max / step);
  const bins = Array.from({ length: n + 1 }, (_, i) => ({
    from: i * step,
    to: i < n ? (i + 1) * step : Infinity,
    names: [] as string[],
  }));
  for (const p of m.people) {
    const i = Math.min(n, Math.floor((p.load + 1e-9) / step));
    bins[i].names.push(p.name);
  }
  const sorted = m.people.map((p) => p.load).sort((a, b) => a - b);
  const mid = sorted.length
    ? sorted.length % 2
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : 0;
  return { bins, median: mid, step };
}

/* ---------- 12. Şirkət × Fəaliyyət forması ---------- */
export function companyActivityMatrix(input: MetricsInput, { view = 'current', filters = {} }: DashOpts = {}) {
  const companies = [...new Set(input.tasks.map((t) => t.company))]
    .filter((c) => !filters.company || c === filters.company)
    .sort((a, b) => a.localeCompare(b, 'az'));
  const activities = [ACT_ADMIN, ACT_PROJECT].filter((a) => !filters.activity || a === filters.activity);
  return companies.flatMap((company) =>
    activities.map((activity) => {
      const m = computeMetrics(input, { view, filters: { company, activity } });
      return { company, activity, hours: m.totalHours, fte: m.fteNeed, people: m.people.length, tasks: m.activeTasks };
    }),
  );
}

/* ---------- 13. Ştat cədvəli ---------- */
export type StaffRow = EmployeeLoad & { free: number; singleProcesses: number; received30: number; given30: number };
/** v1 cədvəli + tək icraçı olduğu proses sayı + son 30 gündə alınan/verilən saat (jurnaldakı ötürmələrə görə). */
export function staffTable(
  input: MetricsInput,
  m: Metrics,
  log: LogEntry[],
  { filters = {}, now = Date.now() }: { filters?: Filters; now?: number } = {},
): StaffRow[] {
  const { active } = filterScope(input, filters);
  const owners = new Map<string, Set<string>>();
  for (const t of active) {
    const s = owners.get(t.process) ?? new Set<string>();
    s.add(curOwner(t));
    owners.set(t.process, s);
  }
  const singleBy = new Map<string, number>();
  for (const [, s] of owners) if (s.size === 1) singleBy.set([...s][0], (singleBy.get([...s][0]) ?? 0) + 1);
  const hoursById = new Map(input.tasks.map((t) => [t.id, t.hours || 0]));
  const since = now - 30 * 864e5;
  const recv = new Map<string, number>();
  const gave = new Map<string, number>();
  for (const l of log) {
    if (l.action !== 'Ötürmə' || !l.task_id || Date.parse(l.ts) < since) continue;
    const h = hoursById.get(l.task_id) ?? 0;
    if (l.to) recv.set(l.to, (recv.get(l.to) ?? 0) + h);
    if (l.from) gave.set(l.from, (gave.get(l.from) ?? 0) + h);
  }
  return loadBars(m, { groups: true }).map((l) => ({
    ...l,
    free: l.isGroup ? 0 : l.cap - l.hours,
    singleProcesses: singleBy.get(l.name) ?? 0,
    received30: recv.get(l.name) ?? 0,
    given30: gave.get(l.name) ?? 0,
  }));
}
