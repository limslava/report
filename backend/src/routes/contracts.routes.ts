import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { adminOnly, roleOrAdmin } from '../middleware/admin-only.middleware';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import {
  createContract,
  decideContractApprovalStep,
  deleteContractAttachment,
  deleteDraftContract,
  downloadContractAttachment,
  downloadContractPrintPackage,
  findContractDuplicates,
  getContractReferences,
  getContractDecisionHistory,
  getContractSlaRules,
  getContractApprovalSheet,
  listMyApprovalInbox,
  getMyApprovalDashboard,
  getWorkCalendar,
  listContractAttachments,
  listContracts,
  listSecurityInbox,
  listMasterContracts,
  prepareContractRevision,
  previewContractAttachment,
  securityVisaDecision,
  syncWorkCalendar,
  startContractApproval,
  uploadContractStepAttachments,
  uploadContractAttachments,
  updateContractSlaRules,
  updateDraftContract,
  upsertWorkCalendarDay,
} from '../controllers/contracts.controller';
import { CONTRACT_APPROVAL_WORK_ROLES, CONTRACT_INITIATOR_ROLES } from '../constants/contract-approval';

const router = Router();

const writeContractAccess = roleOrAdmin(...CONTRACT_APPROVAL_WORK_ROLES, ...CONTRACT_INITIATOR_ROLES);

router.use(authenticate);
router.use(roleOrAdmin(...CONTRACT_APPROVAL_WORK_ROLES, ...CONTRACT_INITIATOR_ROLES, 'general_director'));

router.get('/', listContracts);
router.get('/masters', listMasterContracts);
router.get('/reference', getContractReferences);
router.get('/sla-rules', getContractSlaRules);
router.put(
  '/sla-rules',
  adminOnly,
  [
    body('rules').isArray(),
    body('rules.*.contractType').isIn(['expense', 'income']),
    body('rules.*.incomeSubtype').optional({ nullable: true }).isIn(['standard', 'with_psr']),
    body('rules.*.roleCode').isString().trim().notEmpty(),
    body('rules.*.slaWorkdays').isInt({ min: 1, max: 30 }),
    body('rules.*.isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  updateContractSlaRules,
);
router.get('/work-calendar', getWorkCalendar);
router.post('/work-calendar/sync', adminOnly, syncWorkCalendar);
router.put(
  '/work-calendar/:date',
  adminOnly,
  [
    param('date').matches(/^\d{4}-\d{2}-\d{2}$/),
    body('isWorkday').isBoolean(),
    body('comment').optional({ nullable: true }).isString().isLength({ max: 255 }),
  ],
  handleValidationErrors,
  upsertWorkCalendarDay,
);
router.get('/duplicates', findContractDuplicates);
router.get('/approval-dashboard/my', getMyApprovalDashboard);
router.get('/approval-inbox/my', listMyApprovalInbox);
router.get('/security/inbox', listSecurityInbox);
router.post(
  '/security/inbox/:contractId/visa',
  [
    param('contractId').isUUID(),
    body('visa').isIn(['approved', 'rejected', 'approved_with_remarks']),
    body('comment').optional({ nullable: true }).isString(),
  ],
  handleValidationErrors,
  securityVisaDecision,
);
router.get('/attachments/:attachmentId/download', [param('attachmentId').isUUID()], handleValidationErrors, downloadContractAttachment);
router.get('/attachments/:attachmentId/preview', [param('attachmentId').isUUID()], handleValidationErrors, previewContractAttachment);
router.delete('/attachments/:attachmentId', [param('attachmentId').isUUID()], handleValidationErrors, deleteContractAttachment);
router.get('/:id/decision-history', adminOnly, [param('id').isUUID()], handleValidationErrors, getContractDecisionHistory);
router.get('/:id/approval-sheet', [param('id').isUUID()], handleValidationErrors, getContractApprovalSheet);
router.get('/:id/print-package', [param('id').isUUID()], handleValidationErrors, downloadContractPrintPackage);
router.get('/:id/attachments', [param('id').isUUID()], handleValidationErrors, listContractAttachments);
router.post(
  '/:id/attachments',
  writeContractAccess,
  [
    param('id').isUUID(),
    body('files').isArray({ min: 1, max: 10 }),
    body('files.*.name').isString().trim().notEmpty().isLength({ max: 255 }),
    body('files.*.mimeType').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('files.*.contentBase64').isString().notEmpty(),
    body('files.*.size').optional().isInt({ min: 1 }),
  ],
  handleValidationErrors,
  uploadContractAttachments,
);

router.post(
  '/',
  writeContractAccess,
  [
    body('contractNumber').isString().trim().notEmpty().isLength({ max: 100 }),
    body('contractType').isIn(['expense', 'income']),
    body('incomeSubtype').optional({ nullable: true }).isIn(['standard', 'with_psr']),
    body('counterpartyName').isString().trim().notEmpty().isLength({ max: 255 }),
    body('counterpartyShortName').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('ownershipForm').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('counterpartyForm').optional({ nullable: true }).isIn(['ooo', 'ao', 'pao', 'zao', 'ip']),
    body('counterpartyInn').isString().trim().matches(/^(\d{10}|\d{12})$/),
    body('subject').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
    body('contractDate').optional({ nullable: true }).isISO8601(),
    body('psrFlag').optional().isBoolean(),
    body('signingMethod').optional().isIn(['edo', 'post']),
    body('allowDuplicate').optional().isBoolean(),
    body('documentKind').optional().isIn(['master', 'addendum']),
    body('parentContractId').optional({ nullable: true }).isUUID(),
  ],
  handleValidationErrors,
  createContract,
);

router.put(
  '/:id/draft',
  writeContractAccess,
  [
    param('id').isUUID(),
    body('contractNumber').isString().trim().notEmpty().isLength({ max: 100 }),
    body('contractType').isIn(['expense', 'income']),
    body('incomeSubtype').optional({ nullable: true }).isIn(['standard', 'with_psr']),
    body('counterpartyName').isString().trim().notEmpty().isLength({ max: 255 }),
    body('counterpartyShortName').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('counterpartyForm').optional({ nullable: true }).isIn(['ooo', 'ao', 'pao', 'zao', 'ip']),
    body('counterpartyInn').isString().trim().matches(/^(\d{10}|\d{12})$/),
    body('subject').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
    body('contractDate').optional({ nullable: true }).isISO8601(),
    body('psrFlag').optional().isBoolean(),
    body('signingMethod').optional().isIn(['edo', 'post']),
  ],
  handleValidationErrors,
  updateDraftContract,
);
router.delete('/:id/draft', writeContractAccess, [param('id').isUUID()], handleValidationErrors, deleteDraftContract);

router.post('/:id/new-revision', writeContractAccess, [param('id').isUUID()], handleValidationErrors, prepareContractRevision);
router.post('/:id/start-approval', writeContractAccess, [param('id').isUUID()], handleValidationErrors, startContractApproval);

router.post(
  '/:id/steps/:stepId/decision',
  writeContractAccess,
  [
    param('id').isUUID(),
    param('stepId').isUUID(),
    body('decision').isIn(['approve', 'rework', 'reject']),
    body('comment').optional({ nullable: true }).isString(),
  ],
  handleValidationErrors,
  decideContractApprovalStep,
);

router.post(
  '/:id/steps/:stepId/attachments',
  writeContractAccess,
  [
    param('id').isUUID(),
    param('stepId').isUUID(),
    body('files').isArray({ min: 1, max: 10 }),
    body('files.*.name').isString().trim().notEmpty().isLength({ max: 255 }),
    body('files.*.mimeType').optional({ nullable: true }).isString().isLength({ max: 120 }),
    body('files.*.contentBase64').isString().notEmpty(),
    body('files.*.size').optional().isInt({ min: 1 }),
  ],
  handleValidationErrors,
  uploadContractStepAttachments,
);

export { router as contractsRouter };
