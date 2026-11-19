// Domen əməliyyatları (v1 public/app.js → transferTasks, setCancelled, deleteTasks, saveTaskFromModal,
// openEmployeeModal-ın köçürməsi). Hamısı dataStore.commit ilə: undo, jurnal, diff, sinxron avtomatikdir.
import { ACT_ADMIN } from '../../shared/constants';
import { curOwner, normalizeTask, taskLabel, type DataState, type EmployeeDoc, type TaskDoc } from '../../shared/model';
import type { Draft } from 'immer';
import type { DataStore } from './dataStore';

export const newTaskId = () => 'T-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const nowIso = () => new Date().toISOString();

function ensureEmployee(d: Draft<DataState>, name: string, company: string) {
  name = name.trim();
  if (!name || d.employees.some((e) => e.name === name)) return;
  d.employees.push({ name, company: company || 'Birbank', activity: ACT_ADMIN, fte: 1, is_group: false, active: true, _v: 0 });
}

export type TaskValues = Pick<
  TaskDoc,
  'company' | 'process' | 'category' | 'task' | 'description' | 'min_per_key' | 'annual_freq' | 'unit' | 'hours' | 'after_opt'
>;

export function createActions(store: DataStore) {
  const st = () => store.getState();
  const tasksById = (ids: string[]) => st().data.tasks.filter((t) => ids.includes(t.id));

  return {
    /** Ötürmə: owner_before ilkin sahib kimi saxlanır (boşdursa cari sahib), owner_after = yeni. */
    transferTasks(ids: string[], to: string, comment = ''): number {
      to = to.trim();
      const list = tasksById(ids).filter((t) => curOwner(t) !== to);
      if (!list.length || !to) return 0;
      st().commit(
        list.length === 1 ? `${taskLabel(list[0])} → ${to}` : `${list.length} tapşırıq ${to}-a ötürüldü`,
        (d) => {
          ensureEmployee(d, to, list[0].company);
          const ts = nowIso();
          for (const t of d.tasks)
            if (list.some((x) => x.id === t.id)) {
              if (!t.owner_before) t.owner_before = curOwner(t);
              t.owner_after = to;
              t.updated_at = ts;
            }
        },
        list.map((t) => ({ action: 'Ötürmə', task_id: t.id, task_label: taskLabel(t), from: curOwner(t), to, comment })),
      );
      return list.length;
    },

    setCancelled(ids: string[], value: boolean, comment = ''): number {
      const list = tasksById(ids).filter((t) => t.is_cancelled !== value);
      if (!list.length) return 0;
      st().commit(
        `${list.length} tapşırıq ${value ? 'ləğv edildi' : 'bərpa edildi'}`,
        (d) => {
          const ts = nowIso();
          for (const t of d.tasks)
            if (list.some((x) => x.id === t.id)) {
              t.is_cancelled = value;
              t.updated_at = ts;
            }
        },
        list.map((t) => ({
          action: value ? 'Ləğv' : 'Bərpa',
          task_id: t.id,
          task_label: taskLabel(t),
          from: curOwner(t),
          comment,
        })),
      );
      return list.length;
    },

    deleteTasks(ids: string[]): number {
      const list = tasksById(ids);
      if (!list.length) return 0;
      st().commit(
        `${list.length} tapşırıq silindi`,
        (d) => void (d.tasks = d.tasks.filter((t) => !ids.includes(t.id))),
        list.map((t) => ({ action: 'Silinmə', task_id: t.id, task_label: taskLabel(t), from: curOwner(t) })),
      );
      return list.length;
    },

    /** Yeni tapşırıq (original = null) və ya düzəliş. İcraçı dəyişibsə "Ötürmə" kimi jurnala yazılır. */
    saveTask(original: TaskDoc | null, v: TaskValues, owner: string, cancelled?: boolean): string | null {
      owner = owner.trim();
      if (!original) {
        const nt = normalizeTask({ ...v, id: newTaskId(), owner_before: '', owner_after: owner, updated_at: nowIso() });
        st().commit(
          'Yeni tapşırıq əlavə edildi',
          (d) => {
            ensureEmployee(d, owner, v.company);
            d.tasks.push(nt);
          },
          [{ action: 'Yeni', task_id: nt.id, task_label: taskLabel(nt), to: owner }],
        );
        return nt.id;
      }
      const t = original;
      const prevOwner = curOwner(t);
      const isCancelled = cancelled ?? t.is_cancelled;
      const label = `${v.process} — ${v.task}`;
      const logs = [];
      const changed = (Object.keys(v) as (keyof TaskValues)[]).some((k) => String(t[k] ?? '') !== String(v[k] ?? ''));
      if (changed) logs.push({ action: 'Düzəliş', task_id: t.id, task_label: label });
      if (owner && owner !== prevOwner)
        logs.push({ action: 'Ötürmə', task_id: t.id, task_label: label, from: prevOwner, to: owner });
      if (isCancelled !== t.is_cancelled)
        logs.push({ action: isCancelled ? 'Ləğv' : 'Bərpa', task_id: t.id, task_label: label, from: owner });
      if (!logs.length) return null;
      st().commit(
        'Tapşırıq yeniləndi',
        (d) => {
          const x = d.tasks.find((y) => y.id === t.id);
          if (!x) return;
          Object.assign(x, v, { is_cancelled: isCancelled, updated_at: nowIso() });
          if (owner && owner !== prevOwner) {
            ensureEmployee(d, owner, v.company);
            if (!x.owner_before) x.owner_before = prevOwner;
            x.owner_after = owner;
          }
        },
        logs,
      );
      return t.id;
    },

    /**
     * Əməkdaş: yeni / düzəliş / ad dəyişmə / birləşdirmə (mövcud başqa ad yazılıbsa).
     * Ad dəyişəndə bütün tapşırıqlarda owner_before/owner_after yenilənir.
     */
    saveEmployee(oldName: string | null, nv: Omit<EmployeeDoc, '_v'>): 'created' | 'updated' | 'merged' | 'exists' | 'noop' {
      const emps = st().data.employees;
      nv = { ...nv, name: nv.name.trim() };
      if (!oldName) {
        if (emps.some((e) => e.name === nv.name)) return 'exists';
        st().commit(`${nv.name} əlavə edildi`, (d) => void d.employees.push({ ...nv, _v: 0 }), [
          { action: 'Əməkdaş', task_label: `${nv.name} əlavə edildi` },
        ]);
        return 'created';
      }
      const merging = nv.name !== oldName && emps.some((e) => e.name === nv.name);
      const cur = emps.find((e) => e.name === oldName);
      if (!merging && cur && (Object.keys(nv) as (keyof typeof nv)[]).every((k) => cur[k] === nv[k])) return 'noop';
      st().commit(
        merging ? `${oldName} → ${nv.name} birləşdirildi` : `${nv.name} yeniləndi`,
        (d) => {
          for (const t of d.tasks) {
            if (t.owner_before === oldName) t.owner_before = nv.name;
            if (t.owner_after === oldName) t.owner_after = nv.name;
          }
          if (merging) {
            d.employees = d.employees.filter((e) => e.name !== oldName);
            const target = d.employees.find((e) => e.name === nv.name)!;
            Object.assign(target, { activity: nv.activity, fte: nv.fte, company: nv.company, is_group: nv.is_group });
          } else if (nv.name !== oldName) {
            // Ad dəyişmə: sənəd açarı addır → köhnə silinir, yenisi yaranır
            d.employees = d.employees.filter((e) => e.name !== oldName);
            d.employees.push({ ...nv, _v: 0 });
          } else
            Object.assign(
              d.employees.find((e) => e.name === oldName)!,
              nv,
            );
        },
        [
          {
            action: 'Əməkdaş',
            task_label: merging ? `${oldName} profili ${nv.name} ilə birləşdirildi` : `${oldName} profili yeniləndi`,
            from: oldName,
            to: nv.name !== oldName ? nv.name : '',
          },
        ],
      );
      return merging ? 'merged' : 'updated';
    },

    /** Yalnız tapşırığı olmayan əməkdaş silinə bilər (v1 qaydası). */
    deleteEmployee(name: string): boolean {
      if (st().data.tasks.some((t) => t.owner_before === name || t.owner_after === name)) return false;
      st().commit(`${name} silindi`, (d) => void (d.employees = d.employees.filter((e) => e.name !== name)), [
        { action: 'Əməkdaş', task_label: `${name} silindi` },
      ]);
      return true;
    },

    /** Əməkdaşın bütün aktiv işlərini başqasına ötürür. */
    transferAll(from: string, to: string, comment = ''): number {
      const ids = st()
        .data.tasks.filter((t) => !t.is_cancelled && curOwner(t) === from)
        .map((t) => t.id);
      return this.transferTasks(ids, to, comment);
    },
  };
}

export type Actions = ReturnType<typeof createActions>;
