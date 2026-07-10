import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/auth-store';
import DashboardLayout from './layouts/DashboardLayout';
import LoginPage from './pages/LoginPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import {
  authenticatedRoutes,
  getDefaultAuthenticatedRoute,
  guardedRouteElement,
} from './routes/appRoutes';

function App() {
  const { token, user } = useAuthStore();
  const location = useLocation();
  const isAuthenticated = !!token;
  const defaultAuthenticatedRoute = getDefaultAuthenticatedRoute(user?.role);
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

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
          {authenticatedRoutes.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={guardedRouteElement(route, user?.role)}
            />
          ))}
        </Route>
      ) : (
        <Route
          path="*"
          element={<Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />}
        />
      )}
    </Routes>
  );
}

export default App;
