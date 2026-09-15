import { NextFunction, Request, Response, Router } from 'express';
import { body, param, query } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { DISPATCHER_HISTORY_ROLES } from '../services/dispatcher-history.service';
import {
  createDispatcherDictionaryItem,
  createDispatcherOrder,
  createDispatcherOrdersBatch,
  createDispatcherStatus,
  deleteDispatcherDictionaryItem,
  deleteDispatcherOrder,
  deleteDispatcherStatus,
  importDispatcherOrders,
  listDispatcherCrew,
  listDispatcherDictionaries,
  listDispatcherDictionaryOptions,
  listDispatcherHistory,
  listDispatcherHistoryUsers,
  listDispatcherOrders,
  listDispatcherStatuses,
  reorderDispatcherDictionary,
  updateDispatcherDictionaryItem,
  updateDispatcherOrder,
  updateDispatcherOrderPositions,
  updateDispatcherStatus,
} from '../controllers/dispatcher-journal.controller';

const router = Router();

/** Журнал диспетчерского отдела КТК Владивосток. */
export const DISPATCHER_JOURNAL_ROLES = ['manager_ktk_vvo', 'head_ktk_vvo'] as const;
/** Ведение справочников реестра (статусы, типы КТК, НДС, операции): руководитель КТК и админ. */
export const DISPATCHER_DICTIONARY_EDIT_ROLES = ['admin', 'head_ktk_vvo'] as const;
/** Цвета значений справочников выбирают и диспетчеры КТК (решение 15.09.2026). */
export const DISPATCHER_DICTIONARY_COLOR_ROLES = [...DISPATCHER_DICTIONARY_EDIT_ROLES, 'manager_ktk_vvo'] as const;
const COLOR_FIELDS = new Set(['color', 'textColor']);

/** Диспетчеру в правке записи справочника доступны только цвета — название, видимость и прочее нет. */
const onlyColorsUnlessEditor = (req: Request, res: Response, next: NextFunction) => {
  const role = req.user?.role ?? '';
  if ((DISPATCHER_DICTIONARY_EDIT_ROLES as readonly string[]).includes(role)) return next();
  const keys = Object.keys((req.body ?? {}) as Record<string, unknown>);
  if (keys.length && keys.every((key) => COLOR_FIELDS.has(key))) return next();
  return res.status(403).json({ message: 'Диспетчер может менять только цвета справочников' });
};

router.use(authenticate, authorizeRole('admin', ...DISPATCHER_JOURNAL_ROLES));

router.get('/statuses', listDispatcherStatuses);
router.get('/dictionary-options', listDispatcherDictionaryOptions);
router.get('/crew', [query('date').matches(/^\d{4}-\d{2}-\d{2}$/)], handleValidationErrors, listDispatcherCrew);

router.get('/dictionaries', listDispatcherDictionaries);
router.post('/dictionaries/statuses', authorizeRole(...DISPATCHER_DICTIONARY_EDIT_ROLES), createDispatcherStatus);
router.patch(
  '/dictionaries/statuses/:id',
  authorizeRole(...DISPATCHER_DICTIONARY_COLOR_ROLES),
  onlyColorsUnlessEditor,
  [param('id').isUUID()],
  handleValidationErrors,
  updateDispatcherStatus,
);
router.delete(
  '/dictionaries/statuses/:id',
  authorizeRole(...DISPATCHER_DICTIONARY_EDIT_ROLES),
  [param('id').isUUID()],
  handleValidationErrors,
  deleteDispatcherStatus,
);
router.post('/dictionaries/items', authorizeRole(...DISPATCHER_DICTIONARY_EDIT_ROLES), createDispatcherDictionaryItem);
router.patch(
  '/dictionaries/items/:id',
  authorizeRole(...DISPATCHER_DICTIONARY_COLOR_ROLES),
  onlyColorsUnlessEditor,
  [param('id').isUUID()],
  handleValidationErrors,
  updateDispatcherDictionaryItem,
);
router.delete(
  '/dictionaries/items/:id',
  authorizeRole(...DISPATCHER_DICTIONARY_EDIT_ROLES),
  [param('id').isUUID()],
  handleValidationErrors,
  deleteDispatcherDictionaryItem,
);
router.post('/import', authorizeRole('admin'), importDispatcherOrders);
router.get('/history', authorizeRole(...DISPATCHER_HISTORY_ROLES), listDispatcherHistory);
router.get('/history/users', authorizeRole(...DISPATCHER_HISTORY_ROLES), listDispatcherHistoryUsers);
router.post('/dictionaries/reorder', authorizeRole(...DISPATCHER_DICTIONARY_EDIT_ROLES), reorderDispatcherDictionary);
router.get(
  '/orders',
  [query('from').matches(/^\d{4}-\d{2}-\d{2}$/), query('to').matches(/^\d{4}-\d{2}-\d{2}$/)],
  handleValidationErrors,
  listDispatcherOrders,
);
router.post(
  '/orders',
  [body('orderDate').matches(/^\d{4}-\d{2}-\d{2}$/)],
  handleValidationErrors,
  createDispatcherOrder,
);
router.post(
  '/orders/batch',
  [body('orderDate').matches(/^\d{4}-\d{2}-\d{2}$/), body('count').isInt({ min: 1, max: 100 })],
  handleValidationErrors,
  createDispatcherOrdersBatch,
);
router.post('/orders/positions', updateDispatcherOrderPositions);
router.patch('/orders/:id', [param('id').isUUID()], handleValidationErrors, updateDispatcherOrder);
router.delete('/orders/:id', [param('id').isUUID()], handleValidationErrors, deleteDispatcherOrder);

export { router as dispatcherJournalRouter };
