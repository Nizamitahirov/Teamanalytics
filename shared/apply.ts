// Op-ların lokal tətbiqi (SPEC §6.5): ssenari datası = baza (cari data) + ssenari op-ları.
// Saf funksiya — klient (ssenari redaktoru, tətbiq önizləməsi) və testlər eyni kodu işlədir.
// Server yazma tərəfi ayrıdır (server/firestore.ts → buildWrites), amma semantika eynidir:
// upsert yalnız göndərilən sahələri dəyişir (updateMask), delete sənədi silir, log nəzərə alınmır.
import { normalizeEmployee, normalizeSettings, normalizeTask, type DataState, type EmployeeDoc, type TaskDoc } from './model.js';
import type { Op } from './schema.js';

export type Snapshot = Omit<DataState, 'log'>;

/** `ops`-u `base`-in üzərinə tətbiq edir, `base`-i dəyişmir. Dəyişməyən sənədlər eyni obyekt qalır. */
export function applyOpsTo(base: Snapshot, ops: readonly Op[]): Snapshot {
  if (!ops.length) return base;
  const tasks = new Map<string, TaskDoc>(base.tasks.map((t) => [t.id, t]));
  const emps = new Map<string, EmployeeDoc>(base.employees.map((e) => [e.name, e]));
  let settings = base.settings;
  for (const op of ops) {
    if (op.t === 'log') continue;
    if (op.table === 'Settings') {
      if (op.t === 'upsert') settings = normalizeSettings({ ...settings, [op.row.key]: op.row.value });
      continue;
    }
    if (op.t === 'delete') {
      if (op.table === 'Tasks') tasks.delete(op.key);
      else emps.delete(op.key);
      continue;
    }
    if (op.table === 'Tasks') {
      const id = String(op.row.id);
      const cur = tasks.get(id);
      tasks.set(id, normalizeTask({ ...(cur ?? {}), ...op.row, _v: cur?._v ?? 0 }));
    } else {
      const name = String(op.row.name).trim();
      const cur = emps.get(name);
      emps.set(name, normalizeEmployee({ ...(cur ?? {}), ...op.row, _v: cur?._v ?? 0 }));
    }
  }
  return { tasks: [...tasks.values()], employees: [...emps.values()], settings };
}
