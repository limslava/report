import { Router } from 'express';
import { body, param } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import {
  createContract,
  decideContractApprovalStep,
  findContractDuplicates,
  getContractReferences,
  getContractApprovalSheet,
  listContracts,
  listMasterContracts,
  startContractApproval,
} from '../controllers/contracts.controller';

const router = Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/', listContracts);
router.get('/masters', listMasterContracts);
router.get('/reference', getContractReferences);
router.get('/duplicates', findContractDuplicates);
router.get('/:id/approval-sheet', [param('id').isUUID()], handleValidationErrors, getContractApprovalSheet);

router.post(
  '/',
  [
    body('contractNumber').isString().trim().notEmpty().isLength({ max: 100 }),
    body('contractType').isIn(['expense', 'income']),
    body('incomeSubtype').optional({ nullable: true }).isIn(['standard', 'with_psr']),
    body('counterpartyName').isString().trim().notEmpty().isLength({ max: 255 }),
    body('counterpartyShortName').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('ownershipForm').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('counterpartyForm').optional({ nullable: true }).isIn(['ooo', 'ao', 'pao', 'gup', 'mup', 'ano', 'fond', 'uchrezhdenie', 'assotsiaciya']),
    body('counterpartyInn').isString().trim().matches(/^\d{10}$/),
    body('templateKind').optional().isIn(['typical', 'non_typical']),
    body('subject').optional({ nullable: true }).isString().trim().isLength({ max: 500 }),
    body('contractDate').optional({ nullable: true }).isISO8601(),
    body('psrFlag').optional().isBoolean(),
    body('signingMethod').optional().isIn(['edo', 'post']),
    body('documentKind').optional().isIn(['master', 'addendum']),
    body('parentContractId').optional({ nullable: true }).isUUID(),
  ],
  handleValidationErrors,
  createContract,
);

router.post('/:id/start-approval', [param('id').isUUID()], handleValidationErrors, startContractApproval);

router.post(
  '/:id/steps/:stepId/decision',
  [
    param('id').isUUID(),
    param('stepId').isUUID(),
    body('decision').isIn(['approve', 'rework', 'reject']),
    body('comment').optional({ nullable: true }).isString(),
    body('acceptedAt').optional({ nullable: true }).isISO8601(),
    body('signedAt').optional({ nullable: true }).isISO8601(),
  ],
  handleValidationErrors,
  decideContractApprovalStep,
);

export { router as contractsRouter };
