import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { asyncHandler } from '../middleware/error-handler';
import {
  downloadOperationsPreviewExcel,
  getOperationsPreviewState,
  saveOperationsPreviewState,
} from '../controllers/operations-preview.controller';

const router = Router();

router.use(authenticate);

router.get(
  '/state',
  authorizeRole('admin', 'manager_ktk_vvo', 'head_ktk_vvo', 'director', 'financer'),
  asyncHandler(getOperationsPreviewState)
);
router.put(
  '/state',
  authorizeRole('admin', 'manager_ktk_vvo', 'head_ktk_vvo'),
  asyncHandler(saveOperationsPreviewState)
);
router.get(
  '/export',
  authorizeRole('admin', 'manager_ktk_vvo', 'head_ktk_vvo', 'director', 'financer'),
  asyncHandler(downloadOperationsPreviewExcel)
);

export { router as operationsPreviewRouter };
