import { Router } from 'express';
import { body } from 'express-validator';
import { login, register, forgotPassword, resetPassword, changePassword, getAppSettings } from '../controllers/auth.controller';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { authenticate } from '../middleware/authenticate';
import { createRateLimiter } from '../middleware/rate-limit';

const router = Router();
const loginRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Слишком много попыток входа. Повторите позже.',
});

router.post('/login',
  loginRateLimiter,
  [
    body('email')
      .isEmail()
      .customSanitizer((value: string) => String(value).trim().toLowerCase()),
    body('password').isLength({ min: 6 }),
  ],
  handleValidationErrors,
  login
);

router.post('/register',
  [
    body('email')
      .isEmail()
      .customSanitizer((value: string) => String(value).trim().toLowerCase()),
    body('password').isLength({ min: 8 }),
    body('fullName').notEmpty().trim(),
    body('department').isIn(['container_vladivostok', 'container_moscow', 'railway', 'autotruck', 'additional', 'admin']),
    body('role').isIn(['operator', 'manager', 'admin']),
  ],
  handleValidationErrors,
  register
);

router.post('/forgot-password',
  [
    body('email')
      .isEmail()
      .customSanitizer((value: string) => String(value).trim().toLowerCase()),
  ],
  handleValidationErrors,
  forgotPassword
);

router.post('/reset-password',
  [
    body('token').notEmpty(),
    body('password').isLength({ min: 8 }),
  ],
  handleValidationErrors,
  resetPassword
);

router.post('/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 }),
  ],
  handleValidationErrors,
  changePassword
);

router.get('/app-settings',
  authenticate,
  getAppSettings
);

export { router as authRouter };
