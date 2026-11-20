import { useAuth } from './auth';
import type { Role } from '../../shared/schema';

/** Rola görə UI icazələri (SPEC §2). Server hər POST-da rolu özü yoxlayır — bu yalnız UX-dir. */
export function useCan(): { role: Role; canEdit: boolean; isAdmin: boolean } {
  const { state } = useAuth();
  const role: Role = state.status === 'ready' ? state.me.user.role : 'viewer';
  return { role, canEdit: role !== 'viewer', isAdmin: role === 'admin' };
}
