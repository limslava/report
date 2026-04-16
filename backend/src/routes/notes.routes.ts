import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { authenticate } from '../middleware/authenticate';
import { roleOrAdmin } from '../middleware/admin-only.middleware';
import {
  listNotes,
  createNote,
  updateNote,
  updateNoteRecipients,
  deleteNote,
  markNoteRead,
  getNoteById,
  getUnreadCount,
} from '../controllers/notes.controller';

const router = Router();

router.use(authenticate);
router.use(roleOrAdmin('director', 'manager_auto'));

router.get(
  '/unread-count',
  getUnreadCount
);

router.get(
  '/',
  [
    query('from').optional().isISO8601({ strict: false }),
    query('to').optional().isISO8601({ strict: false }),
  ],
  handleValidationErrors,
  listNotes
);

router.get(
  '/:id',
  [param('id').isUUID()],
  handleValidationErrors,
  getNoteById
);

router.post(
  '/',
  [
    body('title').isString().trim().notEmpty(),
    body('startAt').isISO8601({ strict: false }),
    body('endAt').isISO8601({ strict: false }),
    body('visibility').optional().isIn(['private', 'targeted', 'broadcast']),
    body('recipientUserIds').optional().isArray(),
    body('recipientRoleIds').optional().isArray(),
  ],
  handleValidationErrors,
  createNote
);

router.patch(
  '/:id',
  [
    param('id').isUUID(),
    body('title').optional().isString(),
    body('startAt').optional().isISO8601({ strict: false }),
    body('endAt').optional().isISO8601({ strict: false }),
  ],
  handleValidationErrors,
  updateNote
);

router.patch(
  '/:id/recipients',
  [
    param('id').isUUID(),
    body('visibility').isIn(['private', 'targeted', 'broadcast']),
    body('recipientUserIds').optional().isArray(),
    body('recipientRoleIds').optional().isArray(),
  ],
  handleValidationErrors,
  updateNoteRecipients
);

router.delete(
  '/:id',
  [param('id').isUUID()],
  handleValidationErrors,
  deleteNote
);

router.post(
  '/:id/read',
  [param('id').isUUID()],
  handleValidationErrors,
  markNoteRead
);

export { router as notesRouter };
