import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { asyncHandler } from '../middleware/error-handler';
import {
  downloadOperationsPreviewExcel,
  downloadOperationsPreviewReport,
  getOperationsPreviewState,
  saveOperationsPreviewState,
} from '../controllers/operations-preview.controller';

const router = Router();

router.use(authenticate);

router.get(
  '/state',
  authorizeRole(
    'admin',
    'manager_ktk_vvo',
    'head_ktk_vvo',
    'manager_ktk_mow',
    'head_ktk_mow',
    'head_hr',
    'hr_specialist',
    'garage_head_vvo',
    'garage_head',
    'warehouse_manager_vvo',
    'security',
    'director',
    'general_director',
    'financer'
  ),
  asyncHandler(getOperationsPreviewState)
);
router.put(
  '/state',
  authorizeRole(
    'admin',
    'manager_ktk_vvo',
    'head_ktk_vvo',
    'manager_ktk_mow',
    'head_ktk_mow',
    'head_hr',
    'hr_specialist',
    'garage_head_vvo',
    'garage_head',
    'warehouse_manager_vvo',
    'security'
  ),
  asyncHandler(saveOperationsPreviewState)
);
router.get(
  '/export',
  authorizeRole(
    'admin',
    'manager_ktk_vvo',
    'head_ktk_vvo',
    'manager_ktk_mow',
    'head_ktk_mow',
    'head_hr',
    'hr_specialist',
    'garage_head_vvo',
    'garage_head',
    'warehouse_manager_vvo',
    'security',
    'director',
    'general_director',
    'financer'
  ),
  asyncHandler(downloadOperationsPreviewExcel)
);
router.get(
  '/report',
  authorizeRole('admin', 'head_hr', 'hr_specialist'),
  asyncHandler(downloadOperationsPreviewReport)
);

export { router as operationsPreviewRouter };
