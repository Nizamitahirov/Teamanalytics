// Brauzer üçün tək data store nüsxəsi + React hook-ları.
import { useStore } from 'zustand';
import { api } from '../lib/api';
import { createDataStore, type DataStoreState } from './dataStore';
import { idbPersist, type Persist } from './persist';
import { createActions } from './actions';

// IndexedDB asinxron açılır — store dərhal yaradılsın deyə gecikdirilmiş adapter
const idb = idbPersist();
const persist: Persist = {
  load: async () => (await idb).load(),
  save: async (s) => (await idb).save(s),
  clear: async () => (await idb).clear(),
};

export const dataStore = createDataStore({
  request: (path, init) => api(path, init),
  persist,
});

export function useData<T>(selector: (s: DataStoreState) => T): T {
  return useStore(dataStore, selector);
}

export const actions = createActions(dataStore);
