import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import {
  batchUpsertPlanningValues,
  bootstrapPlanningCatalog,
  getPlanningYearTotals,
  getPlanningSegmentReport,
  getPlanningMetricsBySegment,
  getPlanningSegments,
  getPlanningSummaryReport,
  getPlanningTechDashboard,
  updatePlanningBasePlan,
  getPlanningValuesByMonth,
  exportPlanningDailyExcel,
  exportPlanningTotalsExcel,
} from '../controllers/planning-v2.controller';

const router = Router();

router.use(authenticate);

router.get('/segments', getPlanningSegments);
router.get('/segments/:segmentCode/metrics', getPlanningMetricsBySegment);
router.get('/values', getPlanningValuesByMonth);
router.put('/values/batch', batchUpsertPlanningValues);
router.get('/reports/segment', getPlanningSegmentReport);
router.get('/reports/summary', getPlanningSummaryReport);
router.get('/reports/tech-dashboard', authorizeRole('admin', 'director', 'financer', 'manager_sales', 'head_sales', 'head_ktk_vvo'), getPlanningTechDashboard);
router.get('/exports/daily', exportPlanningDailyExcel);
router.get('/exports/totals', exportPlanningTotalsExcel);
router.get('/totals/year', getPlanningYearTotals);
router.put('/totals/base-plan', updatePlanningBasePlan);

router.post('/bootstrap', authorizeRole('admin'), bootstrapPlanningCatalog);

export { router as planningV2Router };
