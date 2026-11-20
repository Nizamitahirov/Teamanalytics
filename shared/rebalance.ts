// Yükü balanslama tövsiyəsi (SPEC §8) — deterministik greedy. Nəticə HEÇ VAXT birbaşa tətbiq olunmur:
// UI onu ssenari dəyişiklikləri kimi açır. Saf funksiya (klient + testlər).
import { curOwner, type TaskDoc } from './model.js';
import { effHours } from './metrics.js';
import type { Snapshot } from './apply.js';

export type RebalanceOptions = {
  /** Hədd θ (1 = 100%) */
  theta?: number;
  /** Qəbul edən tapşırığın şirkətindən olmalıdır (default açıq, S3) */
  sameCompany?: boolean;
  /** Qəbul edən donorla eyni fəaliyyət formasında olmalıdır (default söndürülü) */
  sameActivity?: boolean;
  /** Toxunulmaz (kilidli) tapşırıqlar */
  locked?: Iterable<string>;
  /** Ayrılan əməkdaşlar: bütün işləri ötürülür, özləri qəbul edən olmur ("Əməkdaş ayrılır" şablonu) */
  evacuate?: Iterable<string>;
};

export type RebalanceTransfer = { taskId: string; label: string; from: string; to: string; hours: number };
export type RebalanceResult = {
  transfers: RebalanceTransfer[];
  /** Əməkdaş → yük (0..∞), əvvəl / sonra */
  before: Record<string, number>;
  after: Record<string, number>;
  /** Həll olunmayan qalıq: donor → həddən artıq saat (yeni ştat və ya optimizasiya lazımdır) */
  shortfall: { name: string; hours: number }[];
};

/** Qəbul edəndə qalmalı olan bufer (5%) */
export const BUFFER = 0.05;

type TaskExt = TaskDoc & { eligible?: string[] };
type Person = { name: string; company: string; activity: string; cap: number; hours: number; skills?: string[] };

export function rebalance(data: Snapshot, opts: RebalanceOptions = {}): RebalanceResult {
  const theta = opts.theta ?? 1;
  const sameCompany = opts.sameCompany ?? true;
  const sameActivity = opts.sameActivity ?? false;
  const locked = new Set(opts.locked ?? []);
  const evacuate = new Set(opts.evacuate ?? []);
  const N = data.settings.norm;

  // Tutum (§7.3; məzuniyyətlər hələ yoxdur) və cari saatlar (§7.4) — yalnız siyahıdakı, aktiv, qrup olmayan əməkdaşlar
  const people = new Map<string, Person>();
  for (const e of data.employees) {
    if (e.is_group || !e.active) continue;
    const ext = e as typeof e & { capacity_overrides?: Record<string, number>; skills?: string[] };
    const override = ext.capacity_overrides?.[String(new Date().getFullYear())] ?? 1;
    people.set(e.name, {
      name: e.name,
      company: e.company,
      activity: e.activity,
      cap: N * e.fte * override,
      hours: 0,
      skills: ext.skills,
    });
  }
  const active = data.tasks.filter((t) => !t.is_cancelled) as TaskExt[];
  const procOwners = new Map<string, Set<string>>();
  for (const t of active) {
    const o = curOwner(t);
    const p = people.get(o);
    if (p) p.hours += effHours(t);
    if (!procOwners.has(t.process)) procOwners.set(t.process, new Set());
    procOwners.get(t.process)!.add(o);
  }
  const loadOf = (p: Person) => (p.cap > 0 ? p.hours / p.cap : p.hours > 0 ? Infinity : 0);
  const snapshotLoads = () => Object.fromEntries([...people.values()].map((p) => [p.name, loadOf(p)]));
  const before = snapshotLoads();

  const byName = (a: string, b: string) => a.localeCompare(b, 'az');
  const donors = [...people.values()]
    .filter((p) => evacuate.has(p.name) || loadOf(p) > theta)
    .sort(
      (a, b) => Number(evacuate.has(b.name)) - Number(evacuate.has(a.name)) || loadOf(b) - loadOf(a) || byName(a.name, b.name),
    );

  const transfers: RebalanceTransfer[] = [];
  const shortfall: { name: string; hours: number }[] = [];
  for (const donor of donors) {
    const leaving = evacuate.has(donor.name);
    const target = leaving ? 0 : theta;
    const done = () => (leaving ? donor.hours <= 1e-9 : loadOf(donor) <= target);
    const own = active
      .filter((t) => curOwner(t) === donor.name && !locked.has(t.id))
      .sort((a, b) => effHours(a) - effHours(b) || byName(a.id, b.id));
    for (const t of own) {
      if (done()) break;
      const h = effHours(t);
      let best: { p: Person; after: number } | null = null;
      for (const p of people.values()) {
        if (p === donor || evacuate.has(p.name) || p.cap <= 0) continue;
        if (sameCompany && p.company !== t.company) continue;
        if (sameActivity && p.activity !== donor.activity) continue;
        if (t.eligible?.length && !t.eligible.includes(p.name)) continue;
        if (p.skills?.length && !p.skills.includes(t.process)) continue;
        const after = (p.hours + h) / p.cap;
        if (after > theta - BUFFER + 1e-9) continue;
        if (
          !best ||
          after < best.after - 1e-12 ||
          (Math.abs(after - best.after) <= 1e-12 &&
            (knows(p.name, t.process) !== knows(best.p.name, t.process)
              ? knows(p.name, t.process)
              : byName(p.name, best.p.name) < 0))
        )
          best = { p, after };
      }
      if (!best) continue;
      best.p.hours += h;
      donor.hours -= h;
      procOwners.get(t.process)!.add(best.p.name);
      transfers.push({ taskId: t.id, label: `${t.process} — ${t.task}`, from: donor.name, to: best.p.name, hours: h });
    }
    const excess = leaving ? donor.hours : donor.hours - theta * donor.cap;
    if (excess > 1e-6) shortfall.push({ name: donor.name, hours: excess });
  }
  return { transfers, before, after: snapshotLoads(), shortfall };

  function knows(name: string, process: string) {
    return procOwners.get(process)?.has(name) ?? false;
  }
}
