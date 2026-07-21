import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  createCandidateCheck,
  decideCandidateCheck,
  downloadCandidateCheckAttachment,
  listCandidateChecks,
  previewCandidateCheckAttachment,
} from '../controllers/candidate-checks.controller';
import { authenticate } from '../middleware/authenticate';
import { handleValidationErrors } from '../middleware/express-validator.middleware';

const router = Router();

router.use(authenticate);

router.get(
  '/',
  [
    query('q').optional({ nullable: true }).isString().isLength({ max: 255 }),
    query('status').optional({ nullable: true, checkFalsy: true }).isIn(['pending_security', 'approved', 'approved_with_remarks', 'rejected']),
  ],
  handleValidationErrors,
  listCandidateChecks,
);

router.post(
  '/',
  [
    body('candidateFullName').isString().trim().notEmpty().isLength({ max: 255 }),
    body('position').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('email').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('hrComment').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
    body('files').isArray({ min: 1, max: 10 }),
    body('files.*.name').isString().trim().notEmpty().isLength({ max: 255 }),
    body('files.*.mimeType').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('files.*.contentBase64').isString().notEmpty(),
    body('files.*.size').optional().isInt({ min: 1 }),
  ],
  handleValidationErrors,
  createCandidateCheck,
);

router.get(
  '/attachments/:attachmentId/download',
  [param('attachmentId').isUUID()],
  handleValidationErrors,
  downloadCandidateCheckAttachment,
);

router.get(
  '/attachments/:attachmentId/preview',
  [param('attachmentId').isUUID()],
  handleValidationErrors,
  previewCandidateCheckAttachment,
);

router.post(
  '/:id/decision',
  [
    param('id').isUUID(),
    body('decision').isIn(['approved', 'approved_with_remarks', 'rejected']),
    body('securityComment').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  decideCandidateCheck,
);

export const candidateChecksRouter = router;
