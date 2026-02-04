import React from 'react';
import PlanDashboard from '../components/plan/PlanDashboard';
import { Box } from '@mui/material';
import { useAuthStore } from '../store/auth-store';
import YearTotalsV2Table from '../components/plan/YearTotalsV2Table';
import { canViewTotalsInPlans } from '../utils/rolePermissions';

interface PlansPageProps {
  mode: 'daily' | 'totals';
}

const PlansPage: React.FC<PlansPageProps> = ({ mode }) => {
  const { user } = useAuthStore();
  const currentYear = new Date().getFullYear();
  const [totalsYear, setTotalsYear] = React.useState<number>(currentYear);
  const canViewYearTotals = canViewTotalsInPlans(user?.role);

  return (
    <Box>
      {mode === 'daily' && <PlanDashboard year={currentYear} />}
      {mode === 'totals' && canViewYearTotals && (
        <YearTotalsV2Table year={totalsYear} isAdmin={user?.role === 'admin'} onYearChange={setTotalsYear} />
      )}
    </Box>
  );
};

export default PlansPage;
