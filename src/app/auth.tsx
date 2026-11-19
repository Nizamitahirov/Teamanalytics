import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { ApiRequestError, getMe, logout as apiLogout } from '../lib/api';
import type { MeResponse } from '../../shared/schema';

type AuthState =
  { status: 'loading' } | { status: 'anonymous' } | { status: 'error'; message: string } | { status: 'ready'; me: MeResponse };

type AuthCtx = { state: AuthState; refresh: () => Promise<void>; logout: () => Promise<void> };
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const refresh = useCallback(async () => {
    try {
      setState({ status: 'ready', me: await getMe() });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) setState({ status: 'anonymous' });
      else setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }, []);
  const logout = useCallback(async () => {
    await apiLogout().catch(() => undefined);
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
