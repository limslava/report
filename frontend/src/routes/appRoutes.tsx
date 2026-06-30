import { Suspense, lazy, ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import RouteAccessGuard from '../components/auth/RouteAccessGuard';
import {
  canAccessAdmin,
  canAccessBillOfLading,
  canAccessContractApproval,
  canAccessOperationsPreview,
  canAccessWarehouse,
  canViewBPDashboard,
  canViewCalendar,
  canViewFinancialPlan,
  canViewOperationsEfficiency,
  canViewPlans,
  canViewSummary,
  canViewTechDashboard,
} from '../utils/rolePermissions';
import { getDefaultAuthenticatedRoute } from './defaultAuthenticatedRoute';

const AdminPage = lazy(() => import('../pages/AdminPage'));
const BPApprovalDashboardPage = lazy(() => import('../pages/BPApprovalDashboardPage'));
const CalendarPage = lazy(() => import('../pages/CalendarPage'));
const ContractApprovalPage = lazy(() => import('../pages/ContractApprovalPage'));
const OperationsPreview = lazy(() => import('../pages/OperationsPreview'));
const OperationsScheduleReportsPage = lazy(() => import('../pages/OperationsScheduleReportsPage'));
const PlansPage = lazy(() => import('../pages/PlansPage'));
const SettingsPage = lazy(() => import('../pages/SettingsPage'));
const SinokorTestPage = lazy(() => import('../pages/SinokorTestPage'));
const SummaryReportPage = lazy(() => import('../pages/SummaryReportPage'));
const SWTechDashboardPage = lazy(() => import('../pages/SWTechDashboardPage'));
const WarehousePage = lazy(() => import('../pages/WarehousePage'));
const WarehouseOperationsPage = lazy(() => import('../pages/WarehouseOperationsPage'));
const WarehouseOnSitePage = lazy(() => import('../pages/WarehouseOnSitePage'));
const WarehouseReceptionPage = lazy(() => import('../pages/WarehouseReceptionPage'));
const WarehouseIssuePage = lazy(() => import('../pages/WarehouseIssuePage'));

type AppRoute = {
  path: string;
  allow: (role?: string | null) => boolean;
  element: (role?: string | null) => ReactNode;
};

const lazyFallback = <div className="calendar-loading">Загрузка...</div>;
const WAREHOUSE_OPERATION_ROLES = new Set(['admin', 'warehouse_manager', 'warehouse_keeper']);

function withSuspense(element: ReactNode): ReactNode {
  return <Suspense fallback={lazyFallback}>{element}</Suspense>;
}

function canAccessWarehouseOperations(role?: string | null): boolean {
  return Boolean(role && WAREHOUSE_OPERATION_ROLES.has(role));
}

export { getDefaultAuthenticatedRoute };

export const authenticatedRoutes: AppRoute[] = [
  {
    path: 'business-processes/dashboard',
    allow: canViewBPDashboard,
    element: () => withSuspense(<BPApprovalDashboardPage />),
  },
  {
    path: 'summary-report',
    allow: canViewSummary,
    element: () => withSuspense(<SummaryReportPage />),
  },
  {
    path: 'admin',
    allow: canAccessAdmin,
    element: () => withSuspense(<AdminPage />),
  },
  {
    path: 'settings',
    allow: () => true,
    element: () => withSuspense(<SettingsPage />),
  },
  {
    path: 'plans',
    allow: canViewPlans,
    element: () => withSuspense(<PlansPage mode="daily" />),
  },
  {
    path: 'plans/totals',
    allow: canViewPlans,
    element: () => withSuspense(<PlansPage mode="totals" />),
  },
  {
    path: 'plans/financial',
    allow: canViewFinancialPlan,
    element: () => withSuspense(<PlansPage mode="financial" />),
  },
  {
    path: 'calendar',
    allow: canViewCalendar,
    element: () => withSuspense(<CalendarPage />),
  },
  {
    path: 'operations-preview',
    allow: (role) => canAccessOperationsPreview(role) || canViewOperationsEfficiency(role),
    element: () => withSuspense(<OperationsPreview />),
  },
  {
    path: 'operations-preview/reports',
    allow: (role) => role === 'admin' || role === 'head_hr' || role === 'hr_specialist',
    element: () => withSuspense(<OperationsScheduleReportsPage />),
  },
  {
    path: 'sw-tech-dashboard',
    allow: canViewTechDashboard,
    element: () => withSuspense(<SWTechDashboardPage />),
  },
  {
    path: 'business-processes/contract-approval',
    allow: canAccessContractApproval,
    element: () => withSuspense(<ContractApprovalPage />),
  },
  {
    path: 'business-processes/bill-of-lading',
    allow: canAccessBillOfLading,
    element: () => withSuspense(<SinokorTestPage />),
  },
  {
    path: 'warehouse',
    allow: canAccessWarehouse,
    element: (role) => withSuspense(
      role === 'warehouse_keeper'
        ? <Navigate to="/warehouse/operations" replace />
        : <WarehousePage />,
    ),
  },
  {
    path: 'warehouse/operations',
    allow: canAccessWarehouseOperations,
    element: () => withSuspense(<WarehouseOperationsPage />),
  },
  {
    path: 'warehouse/on-site',
    allow: canAccessWarehouseOperations,
    element: () => withSuspense(<WarehouseOnSitePage />),
  },
  {
    path: 'warehouse/reception',
    allow: canAccessWarehouseOperations,
    element: () => withSuspense(<WarehouseReceptionPage />),
  },
  {
    path: 'warehouse/issue',
    allow: canAccessWarehouseOperations,
    element: () => withSuspense(<WarehouseIssuePage />),
  },
  {
    path: 'sinokor-test',
    allow: canAccessBillOfLading,
    element: () => withSuspense(<SinokorTestPage />),
  },
];

export function guardedRouteElement(route: AppRoute, role?: string | null): ReactNode {
  return (
    <RouteAccessGuard allow={route.allow(role)}>
      {route.element(role)}
    </RouteAccessGuard>
  );
}
