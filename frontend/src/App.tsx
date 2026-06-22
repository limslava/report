import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { useAuthStore } from './store/auth-store';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SummaryReportPage from './pages/SummaryReportPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import PlansPage from './pages/PlansPage';
import SWTechDashboardPage from './pages/SWTechDashboardPage';
import ContractApprovalPage from './pages/ContractApprovalPage';
import BPApprovalDashboardPage from './pages/BPApprovalDashboardPage';
import SinokorTestPage from './pages/SinokorTestPage';
import WarehousePage from './pages/WarehousePage';
import WarehouseOperationsPage from './pages/WarehouseOperationsPage';
import WarehouseReceptionPage from './pages/WarehouseReceptionPage';
import RouteAccessGuard from './components/auth/RouteAccessGuard';
import {
  canAccessAdmin,
  canAccessBillOfLading,
  canAccessContractApproval,
  canAccessOperationsPreview,
  canViewOperationsEfficiency,
  canViewCalendar,
  canViewFinancialPlan,
  canViewPlans,
  canViewSummary,
  canViewTechDashboard,
  canViewBPDashboard,
  canAccessWarehouse,
} from './utils/rolePermissions';

const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const OperationsPreview = lazy(() => import('./pages/OperationsPreview'));
const OperationsScheduleReportsPage = lazy(() => import('./pages/OperationsScheduleReportsPage'));

function App() {
  const { token, user } = useAuthStore();
  const location = useLocation();
  const isAuthenticated = !!token;
  const defaultAuthenticatedRoute = (() => {
    if (user?.role === 'warehouse_keeper') return '/warehouse/operations';
    if (
      user?.role === 'warehouse_manager'
      || user?.role === 'counterparty_user'
    ) return '/warehouse';
    if (canViewTechDashboard(user?.role)) return '/sw-tech-dashboard';
    if (canViewPlans(user?.role)) return '/plans';
    if (canViewBPDashboard(user?.role)) return '/business-processes/dashboard';
    if (canAccessContractApproval(user?.role)) return '/business-processes/contract-approval';
    if (user?.role === 'garage_head' || user?.role === 'garage_head_vvo') {
      return '/operations-preview?location=garage_vvo&section=mechanics';
    }
    if (user?.role === 'security') {
      return '/operations-preview?location=security_vvo&section=guards';
    }
    if (user?.role === 'head_hr' || user?.role === 'hr_specialist') {
      return '/operations-preview?location=ktk_vvo&section=containers';
    }
    return '/plans';
  })();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {isAuthenticated ? (
          <Route path="/" element={<DashboardLayout />}>
          <Route
            index
            element={<Navigate to={defaultAuthenticatedRoute} replace />}
          />
          <Route
            path="business-processes/dashboard"
            element={(
              <RouteAccessGuard allow={canViewBPDashboard(user?.role)}>
                <BPApprovalDashboardPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="summary-report"
            element={(
              <RouteAccessGuard allow={canViewSummary(user?.role)}>
                <SummaryReportPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="admin"
            element={(
              <RouteAccessGuard allow={canAccessAdmin(user?.role)}>
                <AdminPage />
              </RouteAccessGuard>
            )}
          />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="plans"
            element={(
              <RouteAccessGuard allow={canViewPlans(user?.role)}>
                <PlansPage mode="daily" />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="plans/totals"
            element={(
              <RouteAccessGuard allow={canViewPlans(user?.role)}>
                <PlansPage mode="totals" />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="plans/financial"
            element={(
              <RouteAccessGuard allow={canViewFinancialPlan(user?.role)}>
                <PlansPage mode="financial" />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="calendar"
            element={(
              <RouteAccessGuard allow={canViewCalendar(user?.role)}>
                <Suspense fallback={<div className="calendar-loading">Загрузка...</div>}>
                  <CalendarPage />
                </Suspense>
              </RouteAccessGuard>
            )}
          />
          <Route
            path="operations-preview"
            element={(
              <RouteAccessGuard allow={canAccessOperationsPreview(user?.role) || canViewOperationsEfficiency(user?.role)}>
                <Suspense fallback={<div className="calendar-loading">Загрузка...</div>}>
                  <OperationsPreview />
                </Suspense>
              </RouteAccessGuard>
            )}
          />
          <Route
            path="operations-preview/reports"
            element={(
              <RouteAccessGuard allow={user?.role === 'admin' || user?.role === 'head_hr' || user?.role === 'hr_specialist'}>
                <Suspense fallback={<div className="calendar-loading">Загрузка...</div>}>
                  <OperationsScheduleReportsPage />
                </Suspense>
              </RouteAccessGuard>
            )}
          />
          <Route
            path="sw-tech-dashboard"
            element={(
              <RouteAccessGuard allow={canViewTechDashboard(user?.role)}>
                <SWTechDashboardPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="business-processes/contract-approval"
            element={(
              <RouteAccessGuard allow={canAccessContractApproval(user?.role)}>
                <ContractApprovalPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="business-processes/bill-of-lading"
            element={(
              <RouteAccessGuard allow={canAccessBillOfLading(user?.role)}>
                <SinokorTestPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="warehouse"
            element={(
              <RouteAccessGuard allow={canAccessWarehouse(user?.role)}>
                {user?.role === 'warehouse_keeper'
                  ? (
                    new URLSearchParams(location.search).get('receive') === '1'
                      ? <Navigate to="/warehouse/reception" replace />
                      : <Navigate to="/warehouse/operations" replace />
                  )
                  : <WarehousePage />}
              </RouteAccessGuard>
            )}
          />
          <Route
            path="warehouse/operations"
            element={(
              <RouteAccessGuard allow={[
                'admin',
                'warehouse_manager',
                'warehouse_keeper',
              ].includes(user?.role ?? '')}>
                <WarehouseOperationsPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="warehouse/reception"
            element={(
              <RouteAccessGuard allow={[
                'admin',
                'warehouse_manager',
                'warehouse_keeper',
              ].includes(user?.role ?? '')}>
                <WarehouseReceptionPage />
              </RouteAccessGuard>
            )}
          />
          <Route
            path="sinokor-test"
            element={(
              <RouteAccessGuard allow={canAccessBillOfLading(user?.role)}>
                <SinokorTestPage />
              </RouteAccessGuard>
            )}
          />
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

export default App;
