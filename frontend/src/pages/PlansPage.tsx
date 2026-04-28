import React from 'react';
import PlanDashboard from '../components/plan/PlanDashboard';
import { Box } from '@mui/material';
import { useAuthStore } from '../store/auth-store';
import YearTotalsV2Table from '../components/plan/YearTotalsV2Table';
import { canEditFinancialPlan, canEditTotalsPlan, canViewFinancialPlan, canViewTotalsInPlans } from '../utils/rolePermissions';
import FinancialPlanTable from '../components/plan/FinancialPlanTable';
import { useLocation } from 'react-router-dom';
import { PlanningSegment } from '../types/planning-v2.types';

interface PlansPageProps {
  mode: 'daily' | 'totals' | 'financial';
}

const PlansPage: React.FC<PlansPageProps> = ({ mode }) => {
  const { user } = useAuthStore();
  const location = useLocation();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;
  const params = React.useMemo(() => new URLSearchParams(location.search), [location.search]);
  const parsePositiveInt = (raw: string | null): number | null => {
    if (!raw || !/^\d+$/.test(raw)) return null;
    const value = Number(raw);
    return Number.isInteger(value) && value > 0 ? value : null;
  };
  const queryYear = parsePositiveInt(params.get('year'));
  const queryMonth = parsePositiveInt(params.get('month'));
  const querySegmentRaw = params.get('segment');
  const allowedSegments: PlanningSegment['code'][] = ['KTK_VVO', 'KTK_MOW', 'AUTO', 'RAIL', 'EXTRA', 'TO'];
  const initialDailyYear = queryYear ?? currentYear;
  const initialDailyMonth = queryMonth && queryMonth >= 1 && queryMonth <= 12 ? queryMonth : currentMonth;
  const initialDailySegment = querySegmentRaw && allowedSegments.includes(querySegmentRaw as PlanningSegment['code'])
    ? (querySegmentRaw as PlanningSegment['code'])
    : undefined;

  const [totalsYear, setTotalsYear] = React.useState<number>(queryYear ?? currentYear);
  const [financialYear, setFinancialYear] = React.useState<number>(currentYear);
  const canViewYearTotals = canViewTotalsInPlans(user?.role);
  const canViewFinancial = canViewFinancialPlan(user?.role);
  const canEditFinancial = canEditFinancialPlan(user?.role);

  React.useEffect(() => {
    if (mode !== 'totals') return;
    if (queryYear) {
      setTotalsYear(queryYear);
    }
  }, [mode, queryYear]);

  return (
    <Box>
      {mode === 'daily' && (
        <PlanDashboard
          year={initialDailyYear}
          initialMonth={initialDailyMonth}
          initialSegment={initialDailySegment}
        />
      )}
      {mode === 'totals' && canViewYearTotals && (
        <YearTotalsV2Table
          year={totalsYear}
          isAdmin={canEditTotalsPlan(user?.role)}
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
