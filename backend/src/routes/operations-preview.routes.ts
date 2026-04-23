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
router.use(authorizeRole('admin', 'manager_ktk_vvo', 'head_ktk_vvo'));

router.get('/state', asyncHandler(getOperationsPreviewState));
router.put('/state', asyncHandler(saveOperationsPreviewState));
router.get('/export', asyncHandler(downloadOperationsPreviewExcel));

export { router as operationsPreviewRouter };
