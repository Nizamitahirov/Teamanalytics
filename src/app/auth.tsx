import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError, getMe, logout as apiLogout } from '../lib/api';
import type { MeResponse } from '../../shared/schema';
import { storage } from '../lib/storage';

type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'error'; message: string } | { status: 'ready'; me: MeResponse };

// Son uğurlu /api/me (ad, rol, ayarlar — sirr yoxdur). Yalnız offline açılış üçün; çıxışda və 401-də silinir.
const ME_KEY = 'wfp.v2.me';
function readCachedMe(): MeResponse | null {
  try {
    const v = JSON.parse(storage.get(ME_KEY) ?? 'null') as MeResponse | null;
    return v && v.user?.name ? v : null;
  } catch {
    return null;
  }
}

type AuthCtx = { state: AuthState; refresh: () => Promise<void>; logout: () => Promise<void> };
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const refresh = useCallback(async () => {
    try {
      const me = await getMe();
      storage.set(ME_KEY, JSON.stringify(me));
      setState({ status: 'ready', me });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) {
        storage.remove(ME_KEY);
        setState({ status: 'anonymous' });
        return;
      }
      // Offline açılış (SPEC §6.11): son profil + IndexedDB-dəki data ilə; server hər sorğuda yenə yoxlayır
      const cached = e instanceof ApiRequestError && e.code === 'network' ? readCachedMe() : null;
      if (cached) setState({ status: 'ready', me: cached });
      else setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined);
    storage.remove(ME_KEY);
    setState({ status: 'anonymous' });
  }, []);
  useEffect(() => {
    // İlk açılışda sessiyanı yoxla (cookie HttpOnly-dir, yalnız server bilir)
    // eslint-disable-next-line react-hooks/set-state-in-effect -- xarici sistemlə (server) sinxronizasiya
    void refresh();
  }, [refresh]);
  return <Ctx.Provider value={{ state, refresh, logout }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error('AuthProvider yoxdur');
  return v;
}
