import { Router } from 'express';
import { getSmtpConfig, saveSmtpConfig, testSmtpConfig } from '../controllers/smtp-config.controller';
import { authenticate } from '../middleware/authenticate';

const router = Router();

router.use(authenticate);
// router.use(authorizeRole('admin')); // TODO: Включить после настройки ролей

router.get('/', getSmtpConfig);
router.post('/', saveSmtpConfig);
router.post('/test', testSmtpConfig);

export default router;