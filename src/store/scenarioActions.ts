// Ssenari əməliyyatları (SPEC §6.5, §2). React-dən asılı deyil — node testlərində real API ilə işlədilir.
// Qayda: ssenari ilə işləmək canlı dataya HEÇ NƏ yazmır; yalnız `apply` (və `revert`) dataStore.commit edir —
// beləliklə undo, jurnal, versiya ziddiyyəti və offline növbə adi dəyişikliklərdəki kimi işləyir.
import type { Draft } from 'immer';
import {
  applyOpsLocal,
  compileOps,
  currentDocs,
  invertOps,
  opDocId,
  opKey,
  resolveVersions,
  staleDocs,
  type Snapshot,
} from '../../shared/apply';
import { curOwner, taskLabel, type DataState } from '../../shared/model';
import { newScenarioId, scenarioImpact } from '../../shared/scenario';
import type { Conflict, LogEntry, Op, Scenario, ScenarioChange } from '../../shared/schema';
import type { DataStore, Request } from './dataStore';

export type ScenarioDocChange = {
  id: string;
  table: 'Tasks' | 'Employees' | 'Settings';
  key: string;
  label: string;
  kind: 'create' | 'update' | 'delete';
  fields: { field: string; from: unknown; to: unknown }[];
};
export type ApplyPreview = {
  ops: Op[];
  docs: ScenarioDocChange[];
  /** Ssenari yaradılandan sonra başqası tərəfindən dəyişdirilmiş (ziddiyyətli) sənədlər */
  conflicts: Conflict[];
};
/** Ziddiyyətli sənəd üçün seçim: ssenarininki yazılsın və ya həmin sənəd buraxılsın */
export type ConflictChoice = 'scenario' | 'skip';

const MAX_LOGS = 500;
const live = (store: DataStore): Snapshot => {
  const d = store.getState().data;
  return { tasks: d.tasks, employees: d.employees, settings: d.settings };
};

/** Ssenari op-larının insan üçün izahı (önizləmə cədvəli). */
export function describeOps(state: Snapshot, ops: readonly Op[]): ScenarioDocChange[] {
  const tasks = new Map(state.tasks.map((t) => [t.id, t]));
  const emps = new Map(state.employees.map((e) => [e.name, e]));
  const out: ScenarioDocChange[] = [];
  for (const op of ops) {
    if (op.t === 'log') continue;
    if (op.table === 'Settings') {
      if (op.t === 'upsert')
        out.push({
          id: `Settings/${op.row.key}`,
          table: 'Settings',
          key: op.row.key,
          label: op.row.key,
          kind: 'update',
          fields: [{ field: op.row.key, from: state.settings[op.row.key as keyof typeof state.settings], to: op.row.value }],
        });
      continue;
    }
    const key = opKey(op) as string;
    const cur = (op.table === 'Tasks' ? tasks.get(key) : emps.get(key)) as Record<string, unknown> | undefined;
    const label =
      op.table === 'Tasks' ? (cur ? taskLabel(cur as never) : String((op.t === 'upsert' && op.row.task) || key)) : key;
    if (op.t === 'delete') {
      out.push({ id: opDocId(op)!, table: op.table, key, label, kind: 'delete', fields: [] });
      continue;
    }
    const fields = Object.entries(op.row)
      .filter(([f]) => f !== 'id' && f !== 'name' && f !== 'updated_at' && f !== 'updated_by')
      .filter(([f, v]) => !cur || (cur[f] ?? null) !== (v ?? null))
      .map(([field, to]) => ({ field, from: cur?.[field] ?? null, to }));
    if (cur && !fields.length) continue;
    out.push({ id: opDocId(op)!, table: op.table, key, label, kind: cur ? 'update' : 'create', fields });
  }
  return out;
}

/** Tətbiq zamanı jurnal qeydləri — ötürmə/ləğv tapşırıq tarixçəsinə düşsün deyə tapşırıq üzrə. */
function applyLogs(sc: Scenario, before: Snapshot, ops: readonly Op[], header: string): Partial<LogEntry>[] {
  const tasks = new Map(before.tasks.map((t) => [t.id, t]));
  const logs: Partial<LogEntry>[] = [{ action: 'Ssenari', task_label: header, group: sc.id }];
  for (const op of ops) {
    if (logs.length >= MAX_LOGS) break;
    if (op.t !== 'upsert' || op.table !== 'Tasks') continue;
    const t = tasks.get(String(op.row.id));
    const label = t ? taskLabel(t) : `${op.row.process ?? ''} — ${op.row.task ?? op.row.id}`;
    const base = { task_id: String(op.row.id), task_label: label, group: sc.id, comment: sc.name };
    if (!t) logs.push({ ...base, action: 'Yeni', to: String(op.row.owner_after ?? '') });
    else if ('owner_after' in op.row && op.row.owner_after !== curOwner(t))
      logs.push({ ...base, action: 'Ötürmə', from: curOwner(t), to: String(op.row.owner_after) });
    else if ('is_cancelled' in op.row && op.row.is_cancelled !== t.is_cancelled)
      logs.push({ ...base, action: op.row.is_cancelled ? 'Ləğv' : 'Bərpa', from: curOwner(t) });
    else if ('hours' in op.row) logs.push({ ...base, action: 'Düzəliş', from: String(t.hours), to: String(op.row.hours) });
  }
  for (const op of ops)
    if (op.t !== 'log' && op.table !== 'Tasks' && logs.length < MAX_LOGS)
      logs.push({
        action: op.table === 'Settings' ? 'Ayarlar' : 'Əməkdaş',
        task_label: op.table === 'Settings' ? `${op.t === 'upsert' ? `${op.row.key}: ${op.row.value}` : ''}` : String(opKey(op)),
        group: sc.id,
        comment: sc.name,
      });
  return logs;
}

const replaceState = (d: Draft<DataState>, next: Snapshot) => {
  d.tasks = next.tasks as Draft<DataState>['tasks'];
  d.employees = next.employees as Draft<DataState>['employees'];
  d.settings = next.settings;
};

export function createScenarioActions(store: DataStore, request: Request) {
  const post = async (body: Record<string, unknown>) => {
    const r = (await request('/api/scenarios', { method: 'POST', json: body })) as { scenario: Scenario | null };
    store.getState().putScenario(r.scenario, String(body.id));
    return r.scenario;
  };
  const summaryOf = (changes: readonly ScenarioChange[]) => scenarioImpact(live(store), changes).summary;

  return {
    live: () => live(store),

    async create(name: string, changes: ScenarioChange[] = [], opts: { description?: string; submit?: boolean } = {}) {
      return (await post({
        action: 'create',
        id: newScenarioId(),
        name,
        description: opts.description ?? '',
        base_ts: store.getState().lastTs ?? '',
        changes,
        summary: summaryOf(changes),
        ...(opts.submit ? { submit: true } : {}),
      })) as Scenario;
    },

    async rename(sc: Scenario, name: string, description: string) {
      return post({ action: 'update', id: sc.id, name, description });
    },

    async setChanges(sc: Scenario, changes: ScenarioChange[]) {
      // Optimistik: redaktor dərhal yenilənir; server cavabı gələndə əvəz olunur
      store.getState().putScenario({ ...sc, changes, summary: summaryOf(changes) });
      return post({ action: 'update', id: sc.id, changes, summary: summaryOf(changes) });
    },

    addChange(sc: Scenario, change: ScenarioChange | null) {
      if (!change) return Promise.resolve(sc);
      return this.setChanges(sc, [...sc.changes, change]);
    },

    removeChange(sc: Scenario, id: string) {
      return this.setChanges(
        sc,
        sc.changes.filter((c) => c.id !== id),
      );
    },

    remove: (sc: Scenario) => post({ action: 'delete', id: sc.id }),
    submit: (sc: Scenario) => post({ action: 'submit', id: sc.id }),
    reject: (sc: Scenario, comment: string) => post({ action: 'reject', id: sc.id, comment }),
    archive: (sc: Scenario) => post({ action: 'archive', id: sc.id }),
    restore: (sc: Scenario) => post({ action: 'restore', id: sc.id }),

    /** Tətbiq önizləməsi: hansı sənədlər dəyişəcək + ssenari yaradılandan sonra dəyişmiş sənədlər (ziddiyyət). */
    preview(sc: Scenario): ApplyPreview {
      const state = live(store);
      const ops = compileOps(sc.changes.flatMap((c) => c.ops));
      const { conflicts } = resolveVersions(ops, currentDocs(state, ops));
      return { ops, docs: describeOps(state, ops), conflicts };
    },

    /**
     * Tətbiq: canlı dataya bir commit (bir undo addımı, bir jurnal qrupu), sonra status `applied` + geri alma op-ları.
     * Ziddiyyətli sənədlər üçün seçim: `scenario` — ssenarinin dəyəri yazılır, `skip` — həmin sənəd buraxılır.
     */
    async apply(sc: Scenario, choices: Record<string, ConflictChoice> = {}) {
      const before = live(store);
      const pv = this.preview(sc);
      const blocked = new Set(pv.conflicts.map((c) => `${c.table}/${c.key}`).filter((id) => choices[id] !== 'scenario'));
      const ops = pv.ops.filter((op) => {
        const id = opDocId(op);
        return !id || !blocked.has(id);
      });
      const after = applyOpsLocal(before, ops);
      const revert = invertOps(before, ops);
      store
        .getState()
        .commit(
          `Ssenari: ${sc.name}`,
          (d) => replaceState(d, after),
          applyLogs(sc, before, ops, `Ssenari tətbiq edildi: ${sc.name}`),
        );
      await post({ action: 'applied', id: sc.id, revert });
      return { applied: ops.length, skipped: blocked.size };
    },

    /** Geri alma önizləməsi: tətbiqdən sonra başqa yolla dəyişmiş sənədlər. */
    revertPreview(sc: Scenario) {
      const state = live(store);
      return { docs: describeOps(state, sc.revert), stale: staleDocs(state, sc.revert) };
    },

    async revert(sc: Scenario) {
      const before = live(store);
      const after = applyOpsLocal(before, sc.revert);
      store
        .getState()
        .commit(`Ssenari geri alındı: ${sc.name}`, (d) => replaceState(d, after), [
          { action: 'Geri alma', task_label: `Ssenari geri alındı: ${sc.name}`, group: sc.id },
        ]);
      await post({ action: 'reverted', id: sc.id });
    },

    async markRead(ids: string[] | 'all') {
      const list =
        ids === 'all'
          ? store
              .getState()
              .notifications.filter((n) => !n.read)
              .map((n) => n.id)
          : ids;
      if (!list.length) return;
      store.getState().markRead(list);
      await request('/api/notifications', {
        method: 'POST',
        json: ids === 'all' ? { action: 'read-all' } : { action: 'read', ids: list },
      });
    },
  };
}

export type ScenarioActions = ReturnType<typeof createScenarioActions>;
