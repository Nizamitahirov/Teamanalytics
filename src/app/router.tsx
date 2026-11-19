import { createBrowserRouter, Navigate, Outlet, useLocation } from 'react-router';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from './auth';
import { Shell } from './Shell';
import { NAV } from './nav';
import { LoginPage } from '../features/auth/LoginPage';
import { PlaceholderPage } from '../features/placeholder/PlaceholderPage';
import { DashboardPage } from '../features/dashboard/DashboardPage';

import { NotFoundPage } from '../features/placeholder/NotFoundPage';
import { EmptyState } from '../components/EmptyState';
import { Button } from '../components/Button';
import { Skeleton } from '../components/Skeleton';
import { useI18n } from '../lib/i18n';

/** Sessiya yoxdursa /login-ə yönəldir; yüklənərkən skeleton, xətada "yenidən cəhd et". */
function RequireAuth() {
  const { state, refresh } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  if (state.status === 'loading')
    return (
      <div style={{ padding: 32, display: 'grid', gap: 16, maxWidth: 720 }} aria-busy="true" aria-label={t('state.loading')}>
        <Skeleton height={28} width={280} />
        <Skeleton height={120} />
        <Skeleton height={240} />
      </div>
    );
  if (state.status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (state.status === 'error')
    return (
      <EmptyState
        icon={<AlertTriangle size={26} />}
        title={t('state.error')}
        actions={
          <Button variant="primary" onClick={() => void refresh()}>
            {t('state.retry')}
          </Button>
        }
      >
        {state.message}
      </EmptyState>
    );
  return <Shell me={state.me} />;
}

function PublicOnly() {
  const { state } = useAuth();
  const location = useLocation();
  // Girişdən sonra əvvəl istənən səhifəyə qayıt (RequireAuth `from`-u ötürür)
  const from = (location.state as { from?: string } | null)?.from || '/';
  if (state.status === 'ready') return <Navigate to={from} replace />;
  return <Outlet />;
}

export const router = createBrowserRouter([
  { element: <PublicOnly />, children: [{ path: '/login', element: <LoginPage /> }] },
  {
    element: <RequireAuth />,
    children: [
      { index: true, element: <DashboardPage /> },
      // Ağır səhifələr (TanStack Table/Virtual) ayrıca chunk-larda — ilkin JS ≤ 180 KB (SPEC §11)
      { path: 'tasks', lazy: async () => ({ Component: (await import('../features/tasks/TasksPage')).TasksPage }) },
      {
        path: 'employees',
        lazy: async () => ({ Component: (await import('../features/employees/EmployeesPage')).EmployeesPage }),
      },
      {
        path: 'employees/:name',
        lazy: async () => ({ Component: (await import('../features/employees/EmployeeProfilePage')).EmployeeProfilePage }),
      },
      { path: 'log', lazy: async () => ({ Component: (await import('../features/log/LogPage')).LogPage }) },
      // Hələ hazır olmayan bölmələr
      ...NAV.filter((n) => !['/', '/tasks', '/employees', '/log'].includes(n.path)).map((n) => ({
        path: n.path.slice(1) + '/*',
        element: <PlaceholderPage />,
      })),
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]);
