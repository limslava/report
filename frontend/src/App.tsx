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
import RouteAccessGuard from './components/auth/RouteAccessGuard';
import {
  canAccessAdmin,
  canAccessOperationsPreview,
  canViewOperationsEfficiency,
  canViewCalendar,
  canViewFinancialPlan,
  canViewSummary,
  canViewTechDashboard,
} from './utils/rolePermissions';

const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const OperationsPreview = lazy(() => import('./pages/OperationsPreview'));
const OperationsScheduleReportsPage = lazy(() => import('./pages/OperationsScheduleReportsPage'));

function App() {
  const { token, user } = useAuthStore();
  const isAuthenticated = !!token;
  const defaultAuthenticatedRoute = (() => {
    if (canViewTechDashboard(user?.role)) return '/sw-tech-dashboard';
    if (user?.role === 'security') {
      return '/operations-preview?location=security_vvo&section=guards';
    }
    if (user?.role === 'garage_head' || user?.role === 'garage_head_vvo') {
      return '/operations-preview?location=garage_vvo&section=mechanics';
    }
    if (user?.role === 'warehouse_manager_vvo') {
      return '/operations-preview?location=garage_vvo&section=warehouse_staff';
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
          <Route path="plans" element={<PlansPage mode="daily" />} />
          <Route path="plans/totals" element={<PlansPage mode="totals" />} />
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
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

export default App;
