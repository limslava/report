import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/auth-store';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SummaryReportPage from './pages/SummaryReportPage';
import AdminPage from './pages/AdminPage';
import SettingsPage from './pages/SettingsPage';
import PlansPage from './pages/PlansPage';
import RouteAccessGuard from './components/auth/RouteAccessGuard';
import { canAccessAdmin, canViewFinancialPlan, canViewSummary } from './utils/rolePermissions';

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
            <Route index element={<Navigate to="/plans" replace />} />
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
        </Route>
      ) : (
        <Route path="*" element={<Navigate to="/login" replace />} />
      )}
    </Routes>
  );
}

export default App;
