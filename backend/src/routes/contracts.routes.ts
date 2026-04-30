import { Router } from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { createContract, listContracts, listMasterContracts } from '../controllers/contracts.controller';

const router = Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/', listContracts);
router.get('/masters', listMasterContracts);

router.post(
  '/',
  [
    body('contractNumber').isString().trim().notEmpty().isLength({ max: 100 }),
    body('contractType').isIn(['expense', 'income']),
    body('counterpartyName').isString().trim().notEmpty().isLength({ max: 255 }),
    body('counterpartyShortName').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('ownershipForm').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('counterpartyInn').isString().trim().matches(/^(\d{10}|\d{12})$/),
    body('documentKind').optional().isIn(['master', 'addendum']),
    body('parentContractId').optional({ nullable: true }).isUUID(),
  ],
  handleValidationErrors,
  createContract,
);

export { router as contractsRouter };
