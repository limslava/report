import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import {
  addFinancialVatRate,
  batchUpsertFinancialPlanValues,
  exportFinancialPlanExcel,
  getFinancialPlanReport,
  getFinancialVatRates,
} from '../controllers/financial-plan.controller';

const router = Router();

router.use(authenticate);

router.get('/', authorizeRole('admin', 'director', 'financer'), getFinancialPlanReport);
router.put('/values/batch', authorizeRole('admin', 'director', 'financer'), batchUpsertFinancialPlanValues);
router.get('/export', authorizeRole('admin', 'director', 'financer'), exportFinancialPlanExcel);
router.get('/vat-rates', authorizeRole('admin'), getFinancialVatRates);
router.post('/vat-rates', authorizeRole('admin'), addFinancialVatRate);

export { router as financialPlanRouter };
