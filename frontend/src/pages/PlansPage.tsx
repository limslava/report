import React from 'react';
import PlanDashboard from '../components/plan/PlanDashboard';
import { Box } from '@mui/material';
import { useAuthStore } from '../store/auth-store';
import YearTotalsV2Table from '../components/plan/YearTotalsV2Table';
import { canEditFinancialPlan, canViewFinancialPlan, canViewTotalsInPlans } from '../utils/rolePermissions';
import FinancialPlanTable from '../components/plan/FinancialPlanTable';

interface PlansPageProps {
  mode: 'daily' | 'totals' | 'financial';
}

const PlansPage: React.FC<PlansPageProps> = ({ mode }) => {
  const { user } = useAuthStore();
  const currentYear = new Date().getFullYear();
  const [totalsYear, setTotalsYear] = React.useState<number>(currentYear);
  const [financialYear, setFinancialYear] = React.useState<number>(currentYear);
  const canViewYearTotals = canViewTotalsInPlans(user?.role);
  const canViewFinancial = canViewFinancialPlan(user?.role);
  const canEditFinancial = canEditFinancialPlan(user?.role);

  return (
    <Box>
      {mode === 'daily' && <PlanDashboard year={currentYear} />}
      {mode === 'totals' && canViewYearTotals && (
        <YearTotalsV2Table
          year={totalsYear}
          isAdmin={user?.role === 'admin' || user?.role === 'director'}
          onYearChange={setTotalsYear}
        />
      )}
      {mode === 'financial' && canViewFinancial && (
        <FinancialPlanTable year={financialYear} canEdit={canEditFinancial} onYearChange={setFinancialYear} />
      )}
    </Box>
  );
};

export default PlansPage;
