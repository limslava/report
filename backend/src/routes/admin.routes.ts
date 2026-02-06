import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  getUsers,
  inviteUser,
  updateUser,
  reassignAndDeleteUser,
  resetUserPassword,
  deleteUser,
  getAuditLog,
  getSystemStats,
  getAppSettings,
  updateAppSettings,
} from '../controllers/admin.controller';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';

const router = Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

// User management
router.get('/users',
  [
    query('department').optional().isString(),
    query('role').optional().isString(),
  ],
  handleValidationErrors,
  getUsers
);

router.post('/users/invite',
  [
    body('email')
      .isEmail()
      .customSanitizer((value: string) => String(value).trim().toLowerCase()),
    body('fullName').notEmpty().trim(),
    body('role').isIn([
      'container_vladivostok',
      'container_moscow',
      'railway',
      'autotruck',
      'additional',
      'to_auto',
      'manager_ktk_vvo',
      'manager_ktk_mow',
      'manager_auto',
      'manager_rail',
      'manager_extra',
      'manager_to',
      'manager_sales',
      'admin',
      'director',
      'sales',
      'financer',
    ]),
  ],
  handleValidationErrors,
  inviteUser
);

router.put('/users/:id',
  [
    param('id').isUUID(),
    body('email')
      .optional()
      .isEmail()
      .customSanitizer((value: string) => String(value).trim().toLowerCase()),
    body('fullName').optional().notEmpty(),
    body('department').optional().isString(),
    body('role').optional().isString(),
    body('isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  updateUser
);

router.post('/users/:id/reset-password',
  [
    param('id').isUUID(),
  ],
  handleValidationErrors,
  resetUserPassword
);

router.post('/users/:id/reassign-delete',
  [
    param('id').isUUID(),
    body('targetUserId').isString().notEmpty(),
  ],
  handleValidationErrors,
  reassignAndDeleteUser
);

router.delete('/users/:id',
  [
    param('id').isUUID(),
  ],
  handleValidationErrors,
  deleteUser
);

// Audit logs
router.get('/audit',
  [
    query('userId').optional().isUUID(),
    query('action').optional().isString(),
    query('startDate').optional().isDate(),
    query('endDate').optional().isDate(),
    query('limit').optional().isInt({ min: 1, max: 1000 }),
  ],
  handleValidationErrors,
  getAuditLog
);

// System statistics
router.get('/stats',
  getSystemStats
);

router.get('/app-settings', getAppSettings);
router.put(
  '/app-settings',
  [body('appTitle').optional().isString().isLength({ min: 1, max: 120 })],
  handleValidationErrors,
  updateAppSettings
);

export { router as adminRouter };
