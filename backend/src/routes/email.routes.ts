import { Router } from 'express';
import {
  getSchedules,
  getScheduleById,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  triggerTestEmail,
} from '../controllers/email-schedule.controller';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';

const router = Router();

// Все endpoints требуют аутентификации и роли администратора или менеджера
router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/', getSchedules);
router.get('/:id', getScheduleById);
router.post('/', createSchedule);
router.put('/:id', updateSchedule);
router.delete('/:id', deleteSchedule);
router.post('/:id/test', triggerTestEmail);

export default router;
