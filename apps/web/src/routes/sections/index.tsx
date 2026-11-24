import type { ReactNode } from 'react';
import type { Role } from 'src/lib/api';

import { lazy, Suspense } from 'react';
import { Outlet, Navigate, useRoutes, useLocation } from 'react-router-dom';

import { homeFor, useAuth } from 'src/lib/auth';
import { HrLayout } from 'src/layouts/hr-layout';

import { LoadingScreen } from 'src/components/loading-screen';

// ----------------------------------------------------------------------

const LoginPage = lazy(() => import('src/pages/login'));
const ActivatePage = lazy(() => import('src/pages/activate'));
const HrDashboardPage = lazy(() => import('src/pages/hr/dashboard'));
const HrEmployeesPage = lazy(() => import('src/pages/hr/employees'));
const HrBadgesPage = lazy(() => import('src/pages/hr/badges'));
const HrPayrollPage = lazy(() => import('src/pages/hr/payroll'));
const HrWelfarePage = lazy(() => import('src/pages/hr/welfare'));
const HrShopsPage = lazy(() => import('src/pages/hr/shops'));
const HrSettingsPage = lazy(() => import('src/pages/hr/settings'));
const ShopPage = lazy(() => import('src/pages/shop'));
const LiffPage = lazy(() => import('src/pages/liff'));
const MePage = lazy(() => import('src/pages/me'));

/** Requires sign-in and the role; otherwise sends to login or the user's own home. */
function Guard({ need, children }: { need: Role; children: ReactNode }) {
  const { me, loading, has } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <LoadingScreen />;
  if (!me) return <Navigate to={`/login?next=${encodeURIComponent(pathname)}`} replace />;
  if (!has(need)) return <Navigate to={homeFor(me)} replace />;
  return <>{children}</>;
}

function Home() {
  const { me, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return <Navigate to={homeFor(me)} replace />;
}

export function Router() {
  return useRoutes([
    {
      path: '/',
      element: (
        <Suspense fallback={<LoadingScreen />}>
          <Outlet />
        </Suspense>
      ),
      children: [
        { index: true, element: <Home /> },
        { path: 'login', element: <LoginPage /> },
        { path: 'activate', element: <ActivatePage /> },
        { path: 'liff', element: <LiffPage /> },
        { path: 'me', element: <Guard need="employee"><MePage /></Guard> },
        { path: 'shop', element: <Guard need="merchant"><ShopPage /></Guard> },
        {
          path: 'hr',
          element: (
            <Guard need="hr">
              <HrLayout />
            </Guard>
          ),
          children: [
            { index: true, element: <HrDashboardPage /> },
            { path: 'employees', element: <HrEmployeesPage /> },
            { path: 'badges', element: <HrBadgesPage /> },
            { path: 'payroll', element: <HrPayrollPage /> },
            { path: 'welfare', element: <HrWelfarePage /> },
            { path: 'shops', element: <HrShopsPage /> },
            { path: 'settings', element: <HrSettingsPage /> },
          ],
        },
      ],
    },
    { path: '*', element: <Navigate to="/" replace /> },
  ]);
}
