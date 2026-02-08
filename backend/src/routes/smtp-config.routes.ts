import { Router } from 'express';
import { getSmtpConfig, saveSmtpConfig, testSmtpConfig } from '../controllers/smtp-config.controller';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';

const router = Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/', getSmtpConfig);
router.post('/', saveSmtpConfig);
router.post('/test', testSmtpConfig);

export default router;
