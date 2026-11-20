// Ssenari əməliyyatları (klient): tətbiq (canlı dataya — adi sinxron axını ilə), şablondan yaratma.
import { useMemo } from 'react';
import type { Draft } from 'immer';
import { dataStore, useData } from '../../store';
import { scenStore } from '../../store/scenarios';
import type { Snapshot } from '../../../shared/apply';
import type { DataState } from '../../../shared/model';
import type { Role } from '../../../shared/schema';
import {
  applyLogs,
  automateChange,
  hireTemplate,
  leaveTemplate,
  normChange,
  rebalanceChanges,
  scenarioData,
  transferHours,
  type Scenario,
  type ScenarioChange,
} from '../../../shared/scenario';
import { rebalance, type RebalanceOptions } from '../../../shared/rebalance';
import type { EmployeeDoc } from '../../../shared/model';

/** Canlı data (dəyişməyəndə eyni obyekt). */
export function useLive(): Snapshot {
  const tasks = useData((s) => s.data.tasks);
  const employees = useData((s) => s.data.employees);
  const settings = useData((s) => s.data.settings);
  return useMemo(() => ({ tasks, employees, settings }), [tasks, employees, settings]);
}
export const liveNow = (): Snapshot => {
  const d = dataStore.getState().data;
  return { tasks: d.tasks, employees: d.employees, settings: d.settings };
};

/** Kim nə edə bilər (UI; server də yoxlayır). */
export function scenarioRights(sc: Scenario | undefined, me: string, role: Role, approvalOn: boolean) {
  const editor = role !== 'viewer';
  const admin = role === 'admin';
  const own = !!sc && sc.created_by === me;
  const status = sc?.status;
  return {
    edit: editor && (own || admin) && status === 'draft',
    manage: editor && (own || admin),
    /** Təsdiq axını açıqdırsa editor tətbiq edə bilmir — təsdiqə göndərir */
    apply: (admin || (editor && !approvalOn)) && (status === 'draft' || status === 'pending'),
    submit: editor && !admin && approvalOn && status === 'draft',
    review: admin && status === 'pending',
  };
}

/** Növbə boşalana qədər gözlə (tətbiq yazıldı?) — offline-da `false`. */
async function waitFlushed(timeoutMs = 20_000): Promise<boolean> {
  const done = () => {
    const s = dataStore.getState();
    return !s.queue.length && !s.sending;
  };
  if (done()) return dataStore.getState().status !== 'error';
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsub();
      resolve(false);
    }, timeoutMs);
    const unsub = dataStore.subscribe((s) => {
      if (s.status === 'offline' || s.status === 'error') {
        clearTimeout(timer);
        unsub();
        resolve(false);
      } else if (!s.queue.length && !s.sending) {
        clearTimeout(timer);
        unsub();
        resolve(true);
      }
    });
  });
}

/**
 * Ssenarini canlı dataya tətbiq edir: bir commit (tək "Geri al" ilə qayıdır), jurnalda başlıq + alt qeydlər.
 * `skip` — istifadəçinin ziddiyyətə görə buraxdığı dəyişikliklər.
 * Qaytarır: dəyişən qeyd sayı və serverin qəbul edib-etmədiyi.
 */
export async function applyScenario(sc: Scenario, skip: ReadonlySet<string> = new Set()) {
  const live = liveNow();
  const kept = sc.changes.filter((c) => !skip.has(c.id));
  const target = scenarioData(live, kept);
  const logs = applyLogs(sc.name, live, target);
  const ts = new Date().toISOString();
  const prev = new Map(live.tasks.map((t) => [t.id, t]));
  dataStore.getState().commit(
    `Ssenari: ${sc.name}`,
    (d: Draft<DataState>) => {
      d.tasks = target.tasks.map((t) => (prev.get(t.id) === t ? t : { ...t, updated_at: ts })) as Draft<DataState>['tasks'];
      d.employees = target.employees as Draft<DataState>['employees'];
      d.settings = target.settings;
    },
    logs,
  );
  const saved = await waitFlushed();
  if (saved) await scenStore.getState().action(sc.id, 'applied', { count: logs.length - 1 });
  return { count: logs.length - 1, saved };
}

/** Təsdiq tələb olunurmu (editor, ayar açıq, ötürmə həddi aşılır). */
export const needsApproval = (role: Role, live: Snapshot, changes: readonly ScenarioChange[]) =>
  role === 'editor' && live.settings.approval === 1 && transferHours(live, changes) > live.settings.approval_hours;

/* ---------- şablonlar (SPEC §6.5) ---------- */
export type Template =
  | { kind: 'empty' }
  | { kind: 'leave'; name: string }
  | { kind: 'hire'; emp: Pick<EmployeeDoc, 'name' | 'company' | 'activity' | 'fte'> }
  | { kind: 'automate'; process: string; pct: number }
  | { kind: 'balance'; opts?: RebalanceOptions }
  | { kind: 'norm'; norm: number };

export function templateChanges(live: Snapshot, tpl: Template): ScenarioChange[] {
  const ctx = { scen: live, live };
  switch (tpl.kind) {
    case 'empty':
      return [];
    case 'leave':
      return leaveTemplate(ctx, tpl.name).changes;
    case 'hire':
      return hireTemplate(ctx, tpl.emp).changes;
    case 'automate':
      return [automateChange(ctx, tpl.process, tpl.pct)].filter((c): c is ScenarioChange => !!c);
    case 'balance':
      return rebalanceChanges(ctx, rebalance(live, tpl.opts));
    case 'norm':
      return [normChange(ctx, tpl.norm)].filter((c): c is ScenarioChange => !!c);
  }
}

/** "Yükü balansla" (Panel / Əməkdaşlar): nəticə ssenari kimi açılır, heç vaxt birbaşa tətbiq olunmur (SPEC §8). */
export async function createBalanceScenario(name: string): Promise<string> {
  const changes = templateChanges(liveNow(), { kind: 'balance' });
  return scenStore.getState().create({ name, changes });
}
