import { Router } from 'express';
import { param, query } from 'express-validator';
import { lookupSinokorBlTracking } from '../controllers/carriers.controller';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/error-handler';
import { handleValidationErrors } from '../middleware/express-validator.middleware';

const router = Router();

router.use(authenticate);

router.get(
  '/sinokor/bl/:blNo',
  [
    param('blNo').isString().trim().matches(/^[A-Z0-9-]{6,40}$/i),
    query('debug').optional().isIn(['0', '1']),
  ],
  handleValidationErrors,
  asyncHandler(lookupSinokorBlTracking)
);

export { router as carriersRouter };
