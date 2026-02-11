import { Router } from 'express';
import { body } from 'express-validator';
import { login, register, forgotPassword, resetPassword, changePassword, getAppSettings } from '../controllers/auth.controller';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { authenticate } from '../middleware/authenticate';
import { createRateLimiter } from '../middleware/rate-limit';
import { ROLE_VALUES } from '../constants/role-definitions';

const router = Router();
const loginRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  max: 10,
  message: 'Слишком много попыток входа. Попробуйте снова через',
});
const forgotPasswordRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Слишком много запросов сброса пароля. Повторите позже.',
});

const blockRegisterIfInviteOnly = (_req: any, res: any, next: any) => {
  const inviteOnly = (process.env.INVITE_ONLY ?? 'true').toLowerCase() === 'true';
  if (inviteOnly) {
    return res.status(403).json({
      error: 'Registration disabled',
      message: 'Регистрация доступна только по приглашению администратора.',
      statusCode: 403,
    });
  }
  return next();
};

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
  blockRegisterIfInviteOnly,
  [
    body('email')
      .isEmail()
      .customSanitizer((value: string) => String(value).trim().toLowerCase()),
    body('password').isLength({ min: 8 }),
    body('fullName').notEmpty().trim(),
    body('role').isIn(ROLE_VALUES),
  ],
  handleValidationErrors,
  register
);

router.post('/forgot-password',
  forgotPasswordRateLimiter,
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
