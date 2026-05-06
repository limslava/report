import { Routes, Route, Navigate } from 'react-router-dom';
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
import RouteAccessGuard from './components/auth/RouteAccessGuard';
import {
  canAccessAdmin,
  canAccessContractApproval,
  canAccessOperationsPreview,
  canViewOperationsEfficiency,
  canViewCalendar,
  canViewFinancialPlan,
  canViewPlans,
  canViewSummary,
  canViewTechDashboard,
  canViewBPDashboard,
} from './utils/rolePermissions';

const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const OperationsPreview = lazy(() => import('./pages/OperationsPreview'));

function App() {
  const { token, user } = useAuthStore();
  const isAuthenticated = !!token;

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      
      {isAuthenticated ? (
          <Route path="/" element={<DashboardLayout />}>
          <Route
            index
            element={(
              <Navigate
                to={
                  canViewTechDashboard(user?.role)
                    ? '/sw-tech-dashboard'
                    : (canViewPlans(user?.role)
                      ? '/plans'
                      : (canViewBPDashboard(user?.role)
                        ? '/business-processes/dashboard'
                        : '/business-processes/contract-approval'))
                }
                replace
              />
            )}
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
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

export default App;
