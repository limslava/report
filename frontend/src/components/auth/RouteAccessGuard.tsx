import { Navigate } from 'react-router-dom';
import { ReactNode } from 'react';

interface RouteAccessGuardProps {
  allow: boolean;
  children: ReactNode;
}

export default function RouteAccessGuard({ allow, children }: RouteAccessGuardProps) {
  if (!allow) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
