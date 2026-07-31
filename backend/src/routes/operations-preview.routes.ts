import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { asyncHandler } from '../middleware/error-handler';
import {
  downloadAutoTripDirectionsReport,
  downloadOperationsPreviewExcel,
  downloadOperationsPreviewReport,
  getAutoTripDirectionsReportData,
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
    'manager_to',
    'security',
    'director',
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
    'manager_to',
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
    'manager_to',
    'security',
    'director',
    'financer'
  ),
  asyncHandler(downloadOperationsPreviewExcel)
);
router.get(
  '/report',
  authorizeRole('admin', 'head_hr', 'hr_specialist'),
  asyncHandler(downloadOperationsPreviewReport)
);
router.get(
  '/auto-directions-report/data',
  authorizeRole('admin', 'manager_ktk_vvo', 'head_ktk_vvo'),
  asyncHandler(getAutoTripDirectionsReportData)
);
router.get(
  '/auto-directions-report',
  authorizeRole('admin', 'manager_ktk_vvo', 'head_ktk_vvo'),
  asyncHandler(downloadAutoTripDirectionsReport)
);

export { router as operationsPreviewRouter };
