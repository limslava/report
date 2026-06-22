import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { WAREHOUSE_ACCESS_ROLES } from '../constants/warehouse';
import {
  createWarehouseVehicle,
  getWarehouseVehicle,
  importWarehouseCounterparty,
  issueWarehouseVehicle,
  listWarehouseCounterparties,
  listWarehouseVehicles,
  updateWarehouseVehicle,
} from '../controllers/warehouse.controller';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';

const router = Router();

router.use(authenticate);
router.use(authorizeRole(...WAREHOUSE_ACCESS_ROLES));

router.get('/status', (_req, res) => {
  res.json({
    module: 'warehouse',
    status: 'foundation',
    capabilities: [
      'vehicle-registry',
      'vehicle-reception',
      'storage-periods',
      'additional-services',
      'billing',
    ],
  });
});

router.get(
  '/counterparties',
  [
    query('q').optional().isString().trim().isLength({ max: 255 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  handleValidationErrors,
  listWarehouseCounterparties,
);

router.post(
  '/counterparties/import',
  [body('inn').isString().trim().matches(/^(\d{10}|\d{12})$/)],
  handleValidationErrors,
  importWarehouseCounterparty,
);

router.get(
  '/vehicles',
  [
    query('q').optional().isString().trim().isLength({ max: 100 }),
    query('status').optional({ checkFalsy: true }).isIn(['expected', 'on_site', 'issued']),
    query('vehicleType').optional({ checkFalsy: true }).isIn(['passenger', 'truck']),
    query('counterpartyId').optional({ checkFalsy: true }).isUUID(),
  ],
  handleValidationErrors,
  listWarehouseVehicles,
);

router.get(
  '/vehicles/:id',
  [param('id').isUUID()],
  handleValidationErrors,
  getWarehouseVehicle,
);

router.post(
  '/vehicles',
  [
    body('counterpartyId').isUUID(),
    body('requestNumber').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('requestDate').optional({ nullable: true }).isISO8601({ strict: true }),
    body('vehicleType').isIn(['passenger', 'truck']),
    body('vin').optional({ nullable: true }).isString().trim().isLength({ max: 32 }),
    body('chassisNumber').optional({ nullable: true }).isString().trim().isLength({ max: 64 }),
    body('brand').isString().trim().notEmpty().isLength({ max: 100 }),
    body('model').isString().trim().notEmpty().isLength({ max: 100 }),
    body('registrationNumber').optional({ nullable: true }).isString().trim().isLength({ max: 32 }),
    body('receivedDate').isISO8601({ strict: true }),
    body('fuelLevelPercent').optional({ nullable: true }).isInt({ min: 0, max: 100 }),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  createWarehouseVehicle,
);

router.patch(
  '/vehicles/:id',
  [
    param('id').isUUID(),
    body('vehicleType').optional().isIn(['passenger', 'truck']),
    body('vin').optional({ nullable: true }).isString().trim().isLength({ max: 32 }),
    body('chassisNumber').optional({ nullable: true }).isString().trim().isLength({ max: 64 }),
    body('brand').optional().isString().trim().notEmpty().isLength({ max: 100 }),
    body('model').optional().isString().trim().notEmpty().isLength({ max: 100 }),
    body('registrationNumber').optional({ nullable: true }).isString().trim().isLength({ max: 32 }),
    body('receivedDate').optional().isISO8601({ strict: true }),
    body('fuelLevelPercent').optional({ nullable: true }).isInt({ min: 0, max: 100 }),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  updateWarehouseVehicle,
);

router.post(
  '/vehicles/:id/issue',
  [
    param('id').isUUID(),
    body('issuedDate').isISO8601({ strict: true }),
  ],
  handleValidationErrors,
  issueWarehouseVehicle,
);

export { router as warehouseRouter };
