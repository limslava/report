import { Router } from 'express';
import { body, query } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import {
  getUchetTsComparison,
  runUchetTsImport,
  seedUchetTsMock,
} from '../controllers/uchet-ts.controller';

/** Сверка с программой учёта ТС (SimpleWozi) — только для админа. */
const router = Router();

router.use(authenticate, authorizeRole('admin'));

router.get(
  '/comparison',
  [
    query('year').isInt({ min: 2020, max: 2100 }),
    query('month').isInt({ min: 1, max: 12 }),
  ],
  handleValidationErrors,
  getUchetTsComparison,
);

router.post('/import', runUchetTsImport);

router.post(
  '/mock',
  [
    body('year').isInt({ min: 2020, max: 2100 }),
    body('month').isInt({ min: 1, max: 12 }),
  ],
  handleValidationErrors,
  seedUchetTsMock,
);

export { router as uchetTsRouter };
