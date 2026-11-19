// Data qatı (SPEC §4.3, Mərhələ 2): Zustand (vanilla) + immer.
// v1 sinxron modeli (CLAUDE.md §6) saxlanır və gücləndirilir:
//   commit → diffOps (yalnız dəyişən sahələr + v/base) → növbə → flush (ardıcıl POST /api/ops)
//   pull(since) → unchanged | delta | full; növbə boş deyilsə serverdən gələn TƏTBİQ OLUNMUR
//   + versiya ziddiyyəti (server qaytarır → istifadəçi seçir), + IndexedDB keş və offline növbə, + redo.
// React-dən asılı deyil: node testlərində iki "istifadəçi" kimi işlədilir (tests/server/sync.test.ts).
import { createStore } from 'zustand/vanilla';
import { produce, type Draft } from 'immer';
import type { Conflict, LogEntry, Op, OpsResponse } from '../../shared/schema';
import {
  diffOps,
  EMP_FIELDS,
  normalizeEmployee,
  normalizeSettings,
  normalizeTask,
  TASK_FIELDS,
  type DataState,
  type EmployeeDoc,
  type TaskDoc,
} from '../../shared/model';
import { DEFAULT_SETTINGS } from '../../shared/constants';
import { ApiRequestError } from '../lib/api';
import { CACHE_VERSION, type Persist } from './persist';

export const UNDO_LIMIT = 30;
export const LOG_LIMIT = 2000;

export type Request = (path: string, init?: { method?: string; json?: unknown }) => Promise<unknown>;

type Snapshot = Omit<DataState, 'log'>;
type HistoryEntry = { label: string; snap: Snapshot };
/** Klient tərəfi ziddiyyət: serverin versiyası + bizim versiyamız (ziddiyyət anında yadda saxlanılır). */
export type ClientConflict = Conflict & { mine: TaskDoc | EmployeeDoc | null; label: string };
export type SyncStatus = 'loading' | 'idle' | 'saving' | 'offline' | 'error';

export type DataStoreState = {
  /** Keşdən və ya serverdən data gəlib */
  ready: boolean;
  user: string;
  lastTs: string | null;
  data: DataState;
  queue: Op[][];
  sending: boolean;
  online: boolean;
  status: SyncStatus;
  /** Son uğurlu sinxron vaxtı (ISO) */
  syncedAt: string | null;
  error: string | null;
  undo: HistoryEntry[];
  redo: HistoryEntry[];
  conflicts: ClientConflict[];

  hydrate(): Promise<void>;
  pull(opts?: { full?: boolean }): Promise<boolean>;
  commit(label: string, mutator: (d: Draft<DataState>) => void, logs?: Partial<LogEntry>[]): void;
  undoLast(): void;
  redoLast(): void;
  flush(): Promise<void>;
  setOnline(online: boolean): void;
  resolveConflict(c: ClientConflict, choice: 'mine' | 'theirs'): void;
  clearLocal(): Promise<void>;
};

const emptyData = (): DataState => ({ tasks: [], employees: [], log: [], settings: { ...DEFAULT_SETTINGS } });
const snapOf = (d: DataState): Snapshot => ({ tasks: d.tasks, employees: d.employees, settings: d.settings });
const docId = (table: 'Tasks' | 'Employees', key: string) => `${table}/${key}`;

type ServerData = {
  user?: string;
  ts?: string | null;
  unchanged?: boolean;
  delta?: boolean;
  full?: boolean;
  settings?: Record<string, unknown>;
  tasks?: (Record<string, unknown> & { _deleted?: boolean })[];
  employees?: (Record<string, unknown> & { _deleted?: boolean })[];
  log?: LogEntry[];
};

export type DataStoreDeps = {
  request: Request;
  persist: Persist;
  now?: () => string;
  newId?: () => string;
  /** Uğursuz yazmadan sonra təkrar cəhd gecikməsi (testlərdə 0) */
  retryDelayMs?: number;
};

export function createDataStore(deps: DataStoreDeps) {
  const now = deps.now ?? (() => new Date().toISOString());
  const newId = deps.newId ?? (() => 'L-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8));
  const retryDelay = deps.retryDelayMs ?? 1500;
  // Öz yazmalarımızın versiya zənciri: göndərilən v → serverin verdiyi yeni v.
  // Növbədə gözləyən op köhnə v ilə yaradılıbsa, göndərmə anında yenilənir (özümüzlə ziddiyyət olmasın).
  const acked = new Map<string, { from: number; to: number }>();
  let saveTimer: ReturnType<typeof setTimeout> | null = null;

  const store = createStore<DataStoreState>()((set, get) => {
    const snapshot = () => {
      const s = get();
      return { version: CACHE_VERSION, user: s.user, lastTs: s.lastTs, data: s.data, queue: s.queue } as const;
    };
    const persistNow = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      void deps.persist.save(snapshot()).catch(() => undefined);
    };
    const persistSoon = () => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        saveTimer = null;
        const s = get();
        void deps.persist
          .save({ version: CACHE_VERSION, user: s.user, lastTs: s.lastTs, data: s.data, queue: s.queue })
          .catch(() => undefined);
      }, 50);
    };

    const enqueue = (ops: Op[]) => {
      if (!ops.length) return;
      set((s) => ({ queue: [...s.queue, ops] }));
      persistSoon();
      void get().flush();
    };

    const logRows = (logs: Partial<LogEntry>[], ts: string): LogEntry[] =>
      logs.map((l) => ({
        id: newId(),
        ts,
        user: get().user,
        action: '',
        task_id: '',
        task_label: '',
        from: '',
        to: '',
        comment: '',
        ...l,
      }));
    const logOps = (rows: LogEntry[]): Op[] =>
      rows.map((row) => {
        const { user: _user, ...rest } = row;
        void _user;
        return { t: 'log', row: rest as Record<string, string> };
      });

    /** Bərpa olunan snapshot-dakı sənədlərə cari versiyaları köçürür (köhnə _v ilə özümüzə ziddiyyət olmasın). */
    const withCurrentVersions = (snap: Snapshot, cur: DataState): Snapshot => {
      const tv = new Map(cur.tasks.map((t) => [t.id, t._v]));
      const ev = new Map(cur.employees.map((e) => [e.name, e._v]));
      return {
        settings: snap.settings,
        tasks: snap.tasks.map((t) => (tv.has(t.id) && tv.get(t.id) !== t._v ? { ...t, _v: tv.get(t.id) } : t)),
        employees: snap.employees.map((e) => (ev.has(e.name) && ev.get(e.name) !== e._v ? { ...e, _v: ev.get(e.name) } : e)),
      };
    };

    const applyVersions = (versions: Record<string, number>) => {
      if (!Object.keys(versions).length) return;
      set((s) => ({
        data: {
          ...s.data,
          tasks: s.data.tasks.map((t) => {
            const v = versions[docId('Tasks', t.id)];
            return v != null ? { ...t, _v: v } : t;
          }),
          employees: s.data.employees.map((e) => {
            const v = versions[docId('Employees', e.name)];
            return v != null ? { ...e, _v: v } : e;
          }),
        },
      }));
    };

    const rewriteVersions = (ops: Op[]): Op[] =>
      ops.map((op) => {
        if (op.t === 'log' || op.table === 'Settings' || !('v' in op) || op.v === undefined) return op;
        const key = op.t === 'delete' ? op.key : String(op.table === 'Tasks' ? op.row.id : op.row.name);
        let v = op.v;
        for (let a = acked.get(docId(op.table, key)); a && a.from === v; a = acked.get(docId(op.table, key))) {
          if (a.to === v) break;
          v = a.to;
        }
        return v === op.v ? op : { ...op, v };
      });

    const applyServerData = (d: ServerData) => {
      const s = get();
      if (d.full) {
        set({
          data: {
            tasks: (d.tasks ?? []).map(normalizeTask),
            employees: (d.employees ?? []).map(normalizeEmployee).filter((e) => e.name),
            log: (d.log ?? []).slice(-LOG_LIMIT),
            settings: normalizeSettings(d.settings),
          },
        });
        return;
      }
      if (d.delta) {
        const tasks = new Map(s.data.tasks.map((t) => [t.id, t]));
        for (const t of d.tasks ?? []) {
          if (t._deleted) tasks.delete(String(t.id));
          else tasks.set(String(t.id), normalizeTask(t));
        }
        const emps = new Map(s.data.employees.map((e) => [e.name, e]));
        for (const e of d.employees ?? []) {
          if (e._deleted) emps.delete(String(e.name));
          else emps.set(String(e.name), normalizeEmployee(e));
        }
        const seen = new Set(s.data.log.map((l) => l.id).filter(Boolean));
        const log = [...s.data.log];
        for (const l of d.log ?? [])
          if (!seen.has(l.id)) {
            log.push(l);
            seen.add(l.id);
          }
        log.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
        set({
          data: {
            tasks: [...tasks.values()],
            employees: [...emps.values()],
            log: log.slice(-LOG_LIMIT),
            settings: normalizeSettings(d.settings),
          },
        });
        return;
      }
      const settings = normalizeSettings(d.settings);
      if (JSON.stringify(settings) !== JSON.stringify(s.data.settings)) set({ data: { ...s.data, settings } });
    };

    const isNetwork = (e: unknown) => e instanceof ApiRequestError && e.code === 'network';
    const isSession = (e: unknown) => e instanceof ApiRequestError && e.status === 401;
    const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

    return {
      ready: false,
      user: '',
      lastTs: null,
      data: emptyData(),
      queue: [],
      sending: false,
      online: true,
      status: 'loading',
      syncedAt: null,
      error: null,
      undo: [],
      redo: [],
      conflicts: [],

      async hydrate() {
        const c = await deps.persist.load().catch(() => null);
        if (!c) return;
        set({ user: c.user, lastTs: c.lastTs, data: c.data, queue: c.queue, ready: c.data.tasks.length > 0 });
      },

      async pull({ full = false } = {}) {
        const s = get();
        const since = !full && s.lastTs && s.data.tasks.length ? s.lastTs : null;
        let d: ServerData;
        try {
          d = (await deps.request('/api/data' + (since ? `?since=${encodeURIComponent(since)}` : ''))) as ServerData;
        } catch (e) {
          if (isNetwork(e)) set({ online: false, status: 'offline' });
          else set({ status: 'error', error: message(e) });
          throw e;
        }
        if (d.user && d.user !== get().user) set({ user: d.user });
        // Göndərilməmiş dəyişiklik varsa serverdən gələni hələ tətbiq etmə (öz dəyişikliyimiz itməsin)
        if (get().queue.length || get().sending) return false;
        applyServerData(d);
        set({ lastTs: d.ts ?? get().lastTs, ready: true, online: true, status: 'idle', error: null, syncedAt: now() });
        persistSoon();
        return true;
      },

      commit(label, mutator, logs = []) {
        const prev = get().data;
        const next = produce(prev, mutator);
        const ops = diffOps(prev, next);
        const rows = logRows(logs, now());
        if (!ops.length && !rows.length) return;
        set((s) => ({
          data: { ...next, log: [...next.log, ...rows].slice(-LOG_LIMIT) },
          undo: [...s.undo, { label, snap: snapOf(prev) }].slice(-UNDO_LIMIT),
          redo: [],
        }));
        enqueue([...ops, ...logOps(rows)]);
      },

      undoLast() {
        const s = get();
        const entry = s.undo[s.undo.length - 1];
        if (!entry) return;
        const restored = withCurrentVersions(entry.snap, s.data);
        const ops = diffOps(s.data, restored);
        const rows = logRows([{ action: 'Geri alma', task_label: entry.label }], now());
        set({
          data: { ...restored, log: [...s.data.log, ...rows].slice(-LOG_LIMIT) },
          undo: s.undo.slice(0, -1),
          redo: [...s.redo, { label: entry.label, snap: snapOf(s.data) }].slice(-UNDO_LIMIT),
        });
        enqueue([...ops, ...logOps(rows)]);
      },

      redoLast() {
        const s = get();
        const entry = s.redo[s.redo.length - 1];
        if (!entry) return;
        const restored = withCurrentVersions(entry.snap, s.data);
        const ops = diffOps(s.data, restored);
        const rows = logRows([{ action: 'İrəli alma', task_label: entry.label }], now());
        set({
          data: { ...restored, log: [...s.data.log, ...rows].slice(-LOG_LIMIT) },
          redo: s.redo.slice(0, -1),
          undo: [...s.undo, { label: entry.label, snap: snapOf(s.data) }].slice(-UNDO_LIMIT),
        });
        enqueue([...ops, ...logOps(rows)]);
      },

      async flush() {
        const s = get();
        if (s.sending || !s.queue.length) return;
        if (!s.online) {
          set({ status: 'offline' });
          return;
        }
        set({ sending: true, status: 'saving' });
        const batch = rewriteVersions(get().queue[0]);
        const send = () => deps.request('/api/ops', { method: 'POST', json: { ops: batch } }) as Promise<OpsResponse>;
        try {
          let r: OpsResponse;
          try {
            r = await send();
          } catch (e) {
            if (isSession(e) || isNetwork(e)) throw e;
            await new Promise((res) => setTimeout(res, retryDelay));
            r = await send();
          }
          // Versiya zəncirini yadda saxla və lokal _v-ləri yenilə
          for (const op of batch)
            if (op.t !== 'log' && op.table !== 'Settings' && 'v' in op && op.v !== undefined) {
              const key = op.t === 'delete' ? op.key : String(op.table === 'Tasks' ? op.row.id : op.row.name);
              const to = r.versions?.[docId(op.table, key)];
              if (to != null) acked.set(docId(op.table, key), { from: op.v, to });
            }
          applyVersions(r.versions ?? {});
          if (r.conflicts?.length) {
            const d = get().data;
            const fresh: ClientConflict[] = r.conflicts.map((c) => ({
              ...c,
              mine:
                c.table === 'Tasks'
                  ? (d.tasks.find((t) => t.id === c.key) ?? null)
                  : (d.employees.find((e) => e.name === c.key) ?? null),
              label: c.table === 'Tasks' ? String(c.theirs?.task ?? d.tasks.find((t) => t.id === c.key)?.task ?? c.key) : c.key,
            }));
            set((st) => ({
              conflicts: [...st.conflicts.filter((x) => !fresh.some((f) => f.table === x.table && f.key === x.key)), ...fresh],
            }));
          }
          set((st) => ({ queue: st.queue.slice(1), sending: false }));
          // Göndərilmiş partiya keşdən DƏRHAL çıxarılsın (gecikmə olsa, səhifə bağlananda təkrar göndərilə bilər)
          persistNow();
          if (get().queue.length) return get().flush();
          set({ status: 'idle', error: null, syncedAt: now() });
        } catch (e) {
          set({ sending: false });
          if (isNetwork(e)) {
            // Offline növbə: dəyişikliklər saxlanılır, bağlantı gələndə göndərilir
            set({ online: false, status: 'offline' });
            return;
          }
          if (isSession(e)) {
            set({ status: 'error', error: message(e) });
            return;
          }
          // Server dəyişikliyi qəbul etmədi (v1 davranışı): növbə atılır, son vəziyyət serverdən yüklənir
          set({ queue: [], status: 'error', error: message(e) });
          persistSoon();
          await get()
            .pull({ full: true })
            .catch(() => undefined);
          set({ status: 'error', error: message(e) });
        }
      },

      setOnline(online) {
        set({ online, status: online ? (get().queue.length ? 'saving' : 'idle') : 'offline' });
        if (online) void get().flush();
      },

      resolveConflict(c, choice) {
        set((s) => ({ conflicts: s.conflicts.filter((x) => !(x.table === c.table && x.key === c.key)) }));
        if (choice === 'theirs') {
          set((s) => {
            const d = s.data;
            if (c.table === 'Tasks') {
              const rest = d.tasks.filter((t) => t.id !== c.key);
              return { data: { ...d, tasks: c.theirs ? [...rest, normalizeTask({ ...c.theirs, _v: c.v })] : rest } };
            }
            const rest = d.employees.filter((e) => e.name !== c.key);
            return { data: { ...d, employees: c.theirs ? [...rest, normalizeEmployee({ ...c.theirs, _v: c.v })] : rest } };
          });
          persistSoon();
          return;
        }
        // "Mənimki": bizim versiyanı serverin cari versiyası üzərinə yaz
        const fields: readonly string[] = c.table === 'Tasks' ? TASK_FIELDS : EMP_FIELDS;
        const keyField = c.table === 'Tasks' ? 'id' : 'name';
        const ops: Op[] = [];
        if (c.mine) {
          const row = Object.fromEntries(fields.map((f) => [f, (c.mine as Record<string, unknown>)[f] ?? null])) as Record<
            string,
            string | number | boolean | null
          >;
          row[keyField] = c.key;
          ops.push(
            c.table === 'Tasks' ? { t: 'upsert', table: 'Tasks', row, v: c.v } : { t: 'upsert', table: 'Employees', row, v: c.v },
          );
          // Lokal data bizim versiyamızı göstərsin
          set((s) => {
            const d = s.data;
            if (c.table === 'Tasks')
              return { data: { ...d, tasks: [...d.tasks.filter((t) => t.id !== c.key), { ...(c.mine as TaskDoc), _v: c.v }] } };
            return {
              data: {
                ...d,
                employees: [...d.employees.filter((e) => e.name !== c.key), { ...(c.mine as EmployeeDoc), _v: c.v }],
              },
            };
          });
        } else ops.push({ t: 'delete', table: c.table, key: c.key, v: c.v });
        const rows = logRows(
          [
            {
              action: 'Ziddiyyət',
              task_id: c.table === 'Tasks' ? c.key : '',
              task_label: `${c.label}: mənim versiyam saxlanıldı`,
            },
          ],
          now(),
        );
        set((s) => ({ data: { ...s.data, log: [...s.data.log, ...rows].slice(-LOG_LIMIT) } }));
        enqueue([...ops, ...logOps(rows)]);
      },

      async clearLocal() {
        await deps.persist.clear().catch(() => undefined);
        acked.clear();
        set({
          ready: false,
          user: '',
          lastTs: null,
          data: emptyData(),
          queue: [],
          undo: [],
          redo: [],
          conflicts: [],
          status: 'loading',
        });
      },
    };
  });
  return store;
}

export type DataStore = ReturnType<typeof createDataStore>;
