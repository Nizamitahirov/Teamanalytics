// Hesabatların datası (SPEC §6.7) — saf funksiyalar; rəqəmlər shared/metrics.ts-dən (tək mənbə).
import { fmtFte, fmtHours, fmtPct } from './format.js';
import { checkHealth, type HealthKind } from './health.js';
import { computeMetrics, filterScope, type Filters, type Metrics, type MetricsInput } from './metrics.js';
import { curOwner, statusOf, type TaskDoc } from './model.js';
import type { LogEntry } from './schema.js';

export const DAY = 864e5;

/** Son N gündə ötürmələr (jurnaldakı "Ötürmə" qeydləri; saat — tapşırığın cari saatı). */
export function recentTransfers(tasks: readonly TaskDoc[], log: readonly LogEntry[], days = 30, now = Date.now()) {
  const hours = new Map(tasks.map((t) => [t.id, t.hours || 0]));
  const since = now - days * DAY;
  const list = log.filter((l) => l.action === 'Ötürmə' && l.task_id && Date.parse(l.ts) >= since);
  const ids = new Set(list.map((l) => l.task_id as string));
  return { count: ids.size, hours: [...ids].reduce((s, id) => s + (hours.get(id) ?? 0), 0) };
}

/**
 * Avtomatik şərh — 3 cümlə, şablon əsaslı (LLM yox, SPEC §6.7). Azərbaycan dilində (rəhbərlik hesabatı).
 * Rəqəmlər ekrandakı formatla (§7.12).
 */
export function commentary(m: Metrics, transfers: { count: number; hours: number }): string[] {
  const gap = m.gap;
  const s1 =
    `Şöbədə ${fmtFte(m.fteNeed)} FTE iş var, ${fmtFte(m.fteHave)} ştat mövcuddur ` +
    `(${gap >= 0 ? '+' : '−'}${fmtFte(Math.abs(gap))} ${gap >= 0 ? 'ehtiyat' : 'çatışmazlıq'}). ` +
    `Hesablama effektiv norma ilə aparılır: ${fmtHours(m.normGross)} − ${fmtHours(m.vacationHours)} saat məzuniyyət = ${fmtHours(m.norm)} saat/ştat.`;
  const over = m.over;
  const names = over.slice(0, 3).map((o) => `${o.name} (${fmtPct(o.load)})`);
  const s2 = over.length
    ? `${over.length} əməkdaş normanı aşır: ${names.join(', ')}${over.length > 3 ? ` və daha ${over.length - 3} nəfər` : ''}.`
    : 'Normanı aşan əməkdaş yoxdur.';
  const s3 = transfers.count
    ? `Son 30 gündə ${transfers.count} iş ötürülüb (${fmtHours(transfers.hours)} saat).`
    : 'Son 30 gündə iş ötürülməyib.';
  return [s1, s2, s3];
}

export type ExecutiveReport = {
  m: Metrics;
  sentences: string[];
  risks: {
    over: Metrics['over'];
    singleOwner: Metrics['singleOwnerRisks'];
    health: { kind: HealthKind; n: number }[];
  };
};

export function executiveReport(
  input: MetricsInput,
  log: readonly LogEntry[],
  filters: Filters = {},
  now = Date.now(),
): ExecutiveReport {
  const m = computeMetrics(input, { filters });
  const { scope } = filterScope(input, filters);
  const findings = checkHealth({ tasks: input.tasks, employees: input.employees });
  const byKind = new Map<HealthKind, number>();
  for (const f of findings) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + 1);
  return {
    m,
    sentences: commentary(m, recentTransfers(scope, log, 30, now)),
    risks: { over: m.over, singleOwner: m.singleOwnerRisks, health: [...byKind].map(([kind, n]) => ({ kind, n })) },
  };
}

/** Proses hesabatı: işlər, icraçılar üzrə bölgü, tək icraçı riski. */
export function processReport(input: MetricsInput, process: string) {
  const m = computeMetrics(input);
  const tasks = input.tasks.filter((t) => t.process === process);
  const active = tasks.filter((t) => !t.is_cancelled);
  const hours = active.reduce((s, t) => s + (t.hours || 0), 0);
  const owners = new Map<string, { hours: number; tasks: number }>();
  for (const t of active) {
    const o = owners.get(curOwner(t)) ?? { hours: 0, tasks: 0 };
    o.hours += t.hours || 0;
    o.tasks++;
    owners.set(curOwner(t), o);
  }
  return {
    process,
    hours,
    fte: hours / m.norm,
    norm: m.norm,
    companies: [...new Set(tasks.map((t) => t.company))].sort(),
    owners: [...owners]
      .map(([name, v]) => ({ name, ...v, share: hours ? v.hours / hours : 0 }))
      .sort((a, b) => b.hours - a.hours),
    tasks: [...tasks].sort((a, b) => Number(a.is_cancelled) - Number(b.is_cancelled) || b.hours - a.hours),
    singleOwner: m.singleOwnerRisks.find((r) => r.process === process) ?? null,
    cancelledHours: tasks.filter((t) => t.is_cancelled).reduce((s, t) => s + (t.hours || 0), 0),
  };
}

/** Əməkdaş kartı: yük, işlər, son ötürmələr. */
export function employeeReport(input: MetricsInput, log: readonly LogEntry[], name: string) {
  const m = computeMetrics(input);
  const load = m.loads.find((l) => l.name === name) ?? null;
  const emp = input.employees.find((e) => e.name === name) ?? null;
  const tasks = input.tasks
    .filter((t) => curOwner(t) === name || t.owner_before === name)
    .map((t) => ({ t, status: statusOf(t), mine: curOwner(t) === name }))
    .sort(
      (a, b) => Number(b.mine) - Number(a.mine) || Number(a.t.is_cancelled) - Number(b.t.is_cancelled) || b.t.hours - a.t.hours,
    );
  const transfers = log
    .filter((l) => l.action === 'Ötürmə' && (l.from === name || l.to === name))
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
    .slice(0, 50);
  return { m, emp, load, tasks, transfers };
}

/** Jurnal hesabatı filtri (dövr — [from, to] günlər daxil; ISO tarix "YYYY-MM-DD"). */
export function filterLog(
  log: readonly LogEntry[],
  { from = '', to = '', user = '', action = '' }: { from?: string; to?: string; user?: string; action?: string },
) {
  return log
    .filter(
      (l) =>
        (!from || String(l.ts).slice(0, 10) >= from) &&
        (!to || String(l.ts).slice(0, 10) <= to) &&
        (!user || l.user === user) &&
        (!action || l.action === action),
    )
    .sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
}
