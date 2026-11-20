// Lokal keş (SPEC §4.3): IndexedDB, açar `wfp.v2`. Data + göndərilməmiş növbə saxlanır —
// səhifə dərhal açılır, offline edilən dəyişikliklər brauzer bağlansa da itmir.
import type { Notification, Op, Scenario } from '../../shared/schema';
import type { DataState } from '../../shared/model';

export const CACHE_KEY = 'wfp.v2';
// 2: ssenarilər və bildirişlər də keşdədir (Mərhələ 6) — köhnə keş atılır, tam yükləmə olur
export const CACHE_VERSION = 2;

export type CachedState = {
  version: typeof CACHE_VERSION;
  user: string;
  lastTs: string | null;
  data: DataState;
  queue: Op[][];
  scenarios?: Scenario[];
  notifications?: Notification[];
};

export interface Persist {
  load(): Promise<CachedState | null>;
  save(state: CachedState): Promise<void>;
  clear(): Promise<void>;
}

/** Testlər və IndexedDB olmayan mühit üçün. */
export function memoryPersist(initial: CachedState | null = null): Persist & { value: CachedState | null } {
  const p = {
    value: initial,
    async load() {
      return p.value ? structuredClone(p.value) : null;
    },
    async save(s: CachedState) {
      p.value = structuredClone(s);
    },
    async clear() {
      p.value = null;
    },
  };
  return p;
}

/** IndexedDB (idb-keyval). Əlçatmazdırsa (gizli rejim və s.) səssizcə yaddaşa keçir. */
export async function idbPersist(): Promise<Persist> {
  try {
    const { get, set, del } = await import('idb-keyval');
    await get('__probe__');
    return {
      async load() {
        const v = (await get(CACHE_KEY)) as CachedState | undefined;
        return v && v.version === CACHE_VERSION ? v : null;
      },
      async save(s) {
        await set(CACHE_KEY, s);
      },
      async clear() {
        await del(CACHE_KEY);
      },
    };
  } catch {
    return memoryPersist();
  }
}
