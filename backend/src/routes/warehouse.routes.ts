import express, { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  WAREHOUSE_ACCESS_ROLES,
  WAREHOUSE_CLIENT_MANAGEMENT_ROLES,
  WAREHOUSE_STAFF_ROLES,
} from '../constants/warehouse';
import {
  createWarehouseClient,
  listWarehouseClients,
  searchAvailableCounterparties,
  updateWarehouseClient,
} from '../controllers/warehouse-client.controller';
import {
  createWarehouseVehicle,
  deleteWarehouseVehiclePhoto,
  getWarehouseVehiclePhoto,
  getWarehouseVehicle,
  importWarehouseCounterparty,
  issueWarehouseVehicle,
  listWarehouseCounterparties,
  listWarehouseVehicles,
  listWarehouseVehiclePhotos,
  uploadWarehouseVehiclePhoto,
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
  '/clients',
  [
    query('q').optional().isString().trim().isLength({ max: 255 }),
    query('includeInactive').optional().isBoolean(),
  ],
  handleValidationErrors,
  listWarehouseClients,
);

router.get(
  '/clients/available-counterparties',
  authorizeRole(...WAREHOUSE_CLIENT_MANAGEMENT_ROLES),
  [query('q').optional().isString().trim().isLength({ max: 255 })],
  handleValidationErrors,
  searchAvailableCounterparties,
);

router.post(
  '/clients',
  authorizeRole(...WAREHOUSE_CLIENT_MANAGEMENT_ROLES),
  [
    body('inn').isString().trim().matches(/^(\d{10}|\d{12})$/),
    body('nameFull').isString().trim().notEmpty().isLength({ max: 500 }),
    body('nameShort').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('contractNumber').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('contractDate').optional({ nullable: true }).isISO8601({ strict: true }),
    body('serviceStartDate').optional({ nullable: true }).isISO8601({ strict: true }),
    body('isActive').optional().isBoolean(),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  createWarehouseClient,
);

router.patch(
  '/clients/:clientId',
  authorizeRole(...WAREHOUSE_CLIENT_MANAGEMENT_ROLES),
  [
    param('clientId').isUUID(),
    body('contractNumber').optional({ nullable: true }).isString().trim().isLength({ max: 100 }),
    body('contractDate').optional({ nullable: true }).isISO8601({ strict: true }),
    body('serviceStartDate').optional({ nullable: true }).isISO8601({ strict: true }),
    body('isActive').optional().isBoolean(),
    body('notes').optional({ nullable: true }).isString().trim().isLength({ max: 4000 }),
  ],
  handleValidationErrors,
  updateWarehouseClient,
);

router.get(
  '/counterparties',
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
  [
    query('q').optional().isString().trim().isLength({ max: 255 }),
    query('limit').optional().isInt({ min: 1, max: 50 }),
  ],
  handleValidationErrors,
  listWarehouseCounterparties,
);

router.post(
  '/counterparties/import',
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
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
  '/vehicles/:id/photos',
  [param('id').isUUID()],
  handleValidationErrors,
  listWarehouseVehiclePhotos,
);

router.post(
  '/vehicles/:id/photos',
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
  [
    param('id').isUUID(),
    express.raw({
      type: ['image/jpeg', 'image/png', 'image/webp'],
      limit: '12mb',
    }),
  ],
  handleValidationErrors,
  uploadWarehouseVehiclePhoto,
);

router.get(
  '/vehicles/:id/photos/:photoId',
  [
    param('id').isUUID(),
    param('photoId').isUUID(),
  ],
  handleValidationErrors,
  getWarehouseVehiclePhoto,
);

router.delete(
  '/vehicles/:id/photos/:photoId',
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
  [
    param('id').isUUID(),
    param('photoId').isUUID(),
  ],
  handleValidationErrors,
  deleteWarehouseVehiclePhoto,
);

router.get(
  '/vehicles/:id',
  [param('id').isUUID()],
  handleValidationErrors,
  getWarehouseVehicle,
);

router.post(
  '/vehicles',
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
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
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
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
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
  [
    param('id').isUUID(),
    body('issuedDate').isISO8601({ strict: true }),
  ],
  handleValidationErrors,
  issueWarehouseVehicle,
);

export { router as warehouseRouter };
