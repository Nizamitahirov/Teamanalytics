// Ssenarilər və bildirişlər (SPEC §6.5): ayrıca kiçik store. Məlumat sinxronundan (növbə, undo) asılı deyil —
// ssenari canlı data deyil, birbaşa /api/scenarios ilə yazılır. Dəyişiklik siqnalı: dataStore.scenTs (meta.scen_ts,
// hər 10 s-lik yoxlamada pulsuz gəlir) — fərqlidirsə siyahı yenidən oxunur.
import { createStore } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { api } from '../lib/api';
import type { AppNotification } from '../../shared/schema';
import type { Scenario, ScenarioChange } from '../../shared/scenario';
import { dataStore } from './index';

export type ScenState = {
  scenarios: Scenario[];
  notifications: AppNotification[];
  loaded: boolean;
  error: string | null;
  refresh(): Promise<void>;
  create(s: { name: string; description?: string; changes: ScenarioChange[] }): Promise<string>;
  update(id: string, patch: Partial<Pick<Scenario, 'name' | 'description' | 'changes'>>): Promise<void>;
  action(
    id: string,
    action: 'delete' | 'archive' | 'restore' | 'submit' | 'reject' | 'applied',
    extra?: Record<string, unknown>,
  ): Promise<void>;
  markRead(ids?: string[]): Promise<void>;
};

export const newScenarioId = () => 'S-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
const nowIso = () => new Date().toISOString();

export const scenStore = createStore<ScenState>()((set, get) => {
  const patchLocal = (id: string, p: Partial<Scenario>) =>
    set((s) => ({ scenarios: s.scenarios.map((x) => (x.id === id ? { ...x, ...p } : x)) }));
  let inflight: Promise<void> | null = null;
  return {
    scenarios: [],
    notifications: [],
    loaded: false,
    error: null,
    refresh() {
      if (inflight) return inflight;
      inflight = (async () => {
        try {
          const r = await api<{ scenarios: Scenario[]; notifications: AppNotification[] }>('/api/scenarios');
          set({
            scenarios: r.scenarios.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at))),
            notifications: r.notifications,
            loaded: true,
            error: null,
          });
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e), loaded: true });
        } finally {
          inflight = null;
        }
      })();
      return inflight;
    },
    async create({ name, description = '', changes }) {
      const id = newScenarioId();
      const base_ts = dataStore.getState().lastTs ?? '';
      await api('/api/scenarios', { json: { action: 'create', id, name, description, base_ts, changes } });
      const me = dataStore.getState().user;
      const ts = nowIso();
      set((s) => ({
        scenarios: [
          { id, name, description, status: 'draft', created_by: me, created_at: ts, updated_at: ts, base_ts, changes },
          ...s.scenarios,
        ],
      }));
      return id;
    },
    async update(id, patch) {
      // Optimistik: ekran dərhal yenilənir, uğursuzluqda serverdən yenidən oxunur
      patchLocal(id, { ...patch, updated_at: nowIso() });
      try {
        await api('/api/scenarios', { json: { action: 'update', id, ...patch } });
      } catch (e) {
        await get().refresh();
        throw e;
      }
    },
    async action(id, action, extra = {}) {
      await api('/api/scenarios', { json: { action, id, ...extra } });
      if (action === 'delete') set((s) => ({ scenarios: s.scenarios.filter((x) => x.id !== id) }));
      await get().refresh();
    },
    async markRead(ids) {
      const unread = get().notifications.filter((n) => !n.read && (!ids || ids.includes(n.id)));
      if (!unread.length) return;
      set((s) => ({ notifications: s.notifications.map((n) => (unread.includes(n) ? { ...n, read: true } : n)) }));
      await api('/api/notifications', { json: ids ? { ids } : { all: true } }).catch(() => undefined);
    },
  };
});

// Server siqnalı: scen_ts dəyişdi → yenidən oxu (ilk dəfə də)
dataStore.subscribe((s, prev) => {
  if (s.user !== prev.user) scenStore.setState({ scenarios: [], notifications: [], loaded: false, error: null });
  if (s.scenTs !== prev.scenTs && s.scenTs) void scenStore.getState().refresh();
});

export function useScen<T>(selector: (s: ScenState) => T): T {
  return useStore(scenStore, selector);
}
