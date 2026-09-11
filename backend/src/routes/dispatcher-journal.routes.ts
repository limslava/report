import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import {
  createDispatcherOrder,
  deleteDispatcherOrder,
  listDispatcherOrders,
  listDispatcherStatuses,
  updateDispatcherOrder,
} from '../controllers/dispatcher-journal.controller';

const router = Router();

/** Журнал диспетчерского отдела КТК Владивосток. */
export const DISPATCHER_JOURNAL_ROLES = ['dispatcher_vvo', 'manager_ktk_vvo', 'head_ktk_vvo'] as const;

router.use(authenticate, authorizeRole('admin', ...DISPATCHER_JOURNAL_ROLES));

router.get('/statuses', listDispatcherStatuses);
router.get(
  '/orders',
  [query('date').matches(/^\d{4}-\d{2}-\d{2}$/)],
  handleValidationErrors,
  listDispatcherOrders,
);
router.post(
  '/orders',
  [body('orderDate').matches(/^\d{4}-\d{2}-\d{2}$/)],
  handleValidationErrors,
  createDispatcherOrder,
);
router.patch('/orders/:id', [param('id').isUUID()], handleValidationErrors, updateDispatcherOrder);
router.delete('/orders/:id', [param('id').isUUID()], handleValidationErrors, deleteDispatcherOrder);

export { router as dispatcherJournalRouter };
