// Gündəlik snapshot (SPEC §7.10) — saf funksiya; server (cron) yazır, klient (trend, dövr müqayisəsi) oxuyur.
import { computeMetrics, type Metrics } from './metrics.js';

export type Kpi = {
  hours: number;
  fteNeed: number;
  fteHave: number;
  over: number;
  transfers: number;
  transferHours: number;
  cancelledHours: number;
  optPotential: number;
  optRealized: number;
};
export type SnapshotData = {
  date: string;
  norm: number;
  normGross: number;
  total: Kpi;
  byCompany: Record<string, Kpi>;
  /** Ad → yük (0..∞) */
  loads: Record<string, number>;
};

const kpi = (m: Metrics): Kpi => ({
  hours: round(m.totalHours),
  fteNeed: round(m.fteNeed, 3),
  fteHave: round(m.fteHave, 3),
  over: m.over.length,
  transfers: m.transfers.count,
  transferHours: round(m.transfers.hours),
  cancelledHours: round(m.cancelled.hours),
  optPotential: round(m.optPotential),
  optRealized: round(m.optRealized),
});
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** §7.10 — shared/metrics.ts-dən (Panel ilə eyni rəqəmlər). */
export function buildSnapshot(input: Parameters<typeof computeMetrics>[0], date: string): SnapshotData {
  const m = computeMetrics(input);
  const companies = [...new Set(input.tasks.map((t) => t.company))].sort();
  return {
    date,
    norm: m.norm,
    normGross: m.normGross,
    total: kpi(m),
    byCompany: Object.fromEntries(companies.map((c) => [c, kpi(computeMetrics(input, { filters: { company: c } }))])),
    loads: Object.fromEntries(m.people.map((p) => [p.name, round(p.load, 4)])),
  };
}
