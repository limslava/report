import express, { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  WAREHOUSE_ACCESS_ROLES,
  WAREHOUSE_BILLING_MANAGEMENT_ROLES,
  WAREHOUSE_BILLING_VIEW_ROLES,
  WAREHOUSE_CLIENT_MANAGEMENT_ROLES,
  WAREHOUSE_DATE_CORRECTION_ROLES,
  WAREHOUSE_SERVICE_EXECUTION_ROLES,
  WAREHOUSE_STAFF_ROLES,
  WAREHOUSE_TARIFF_MANAGEMENT_ROLES,
} from '../constants/warehouse';
import {
  createWarehouseClient,
  listWarehouseClients,
  searchAvailableCounterparties,
  updateWarehouseClient,
} from '../controllers/warehouse-client.controller';
import {
  createWarehouseVehicle,
  correctWarehouseVehicleDates,
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
import { isWarehousePhotoBackupEnabled } from '../services/warehouse-photo-storage.service';
import {
  correctWarehousePerformedService,
  createWarehouseTariff,
  listWarehousePerformedServices,
  listWarehouseServices,
  performWarehouseService,
  updateWarehouseService,
} from '../controllers/warehouse-service.controller';
import {
  closeWarehouseBilling,
  exportWarehouseBillingExcel,
  exportWarehouseBillingPdf,
  getWarehouseBillingReport,
} from '../controllers/warehouse-billing.controller';

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
      'vehicle-issue-wizard',
      'storage-periods',
      'additional-services',
      'billing',
      'controlled-date-correction',
      'photo-backup',
    ],
    photoBackupEnabled: isWarehousePhotoBackupEnabled(),
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
    body('contractEndDate').optional({ nullable: true }).isISO8601({ strict: true }),
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
    body('contractEndDate').optional({ nullable: true }).isISO8601({ strict: true }),
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
  '/billing',
  authorizeRole(...WAREHOUSE_BILLING_VIEW_ROLES),
  [
    query('periodFrom').isISO8601({ strict: true }),
    query('periodTo').isISO8601({ strict: true }),
    query('periodTo').custom((value, { req }) => value >= String(req.query?.periodFrom)),
    query('counterpartyId').optional({ checkFalsy: true }).isUUID(),
    query('vehicleType').optional({ checkFalsy: true }).isIn(['passenger', 'truck']),
  ],
  handleValidationErrors,
  getWarehouseBillingReport,
);

router.post(
  '/billing/close',
  authorizeRole(...WAREHOUSE_BILLING_MANAGEMENT_ROLES),
  [
    body('periodFrom').isISO8601({ strict: true }),
    body('periodTo').isISO8601({ strict: true }),
    body('periodTo').custom((value, { req }) => value >= String(req.body?.periodFrom)),
    body('counterpartyId').isUUID(),
  ],
  handleValidationErrors,
  closeWarehouseBilling,
);

router.get(
  '/billing/export.xlsx',
  authorizeRole(...WAREHOUSE_BILLING_VIEW_ROLES),
  [
    query('periodFrom').isISO8601({ strict: true }),
    query('periodTo').isISO8601({ strict: true }),
    query('periodTo').custom((value, { req }) => value >= String(req.query?.periodFrom)),
    query('counterpartyId').optional({ checkFalsy: true }).isUUID(),
    query('vehicleType').optional({ checkFalsy: true }).isIn(['passenger', 'truck']),
  ],
  handleValidationErrors,
  exportWarehouseBillingExcel,
);

router.get(
  '/billing/export.pdf',
  authorizeRole(...WAREHOUSE_BILLING_VIEW_ROLES),
  [
    query('periodFrom').isISO8601({ strict: true }),
    query('periodTo').isISO8601({ strict: true }),
    query('periodTo').custom((value, { req }) => value >= String(req.query?.periodFrom)),
    query('counterpartyId').optional({ checkFalsy: true }).isUUID(),
    query('vehicleType').optional({ checkFalsy: true }).isIn(['passenger', 'truck']),
  ],
  handleValidationErrors,
  exportWarehouseBillingPdf,
);

router.get(
  '/services',
  [query('onDate').optional().isISO8601({ strict: true })],
  handleValidationErrors,
  listWarehouseServices,
);

router.patch(
  '/services/:serviceId',
  authorizeRole(...WAREHOUSE_TARIFF_MANAGEMENT_ROLES),
  [
    param('serviceId').isUUID(),
    body('defaultQuantity').optional().custom((value) => (
      value === null
      || (Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) <= 1000000)
    )),
    body('isActive').optional().isBoolean(),
  ],
  handleValidationErrors,
  updateWarehouseService,
);

router.post(
  '/services/:serviceId/tariffs',
  authorizeRole(...WAREHOUSE_TARIFF_MANAGEMENT_ROLES),
  [
    param('serviceId').isUUID(),
    body('vehicleType').isIn(['passenger', 'truck']),
    body('price').isFloat({ min: 0, max: 1000000000 }),
    body('validFrom').isISO8601({ strict: true }),
  ],
  handleValidationErrors,
  createWarehouseTariff,
);

router.get(
  '/vehicles/:id/services',
  [param('id').isUUID()],
  handleValidationErrors,
  listWarehousePerformedServices,
);

router.post(
  '/vehicles/:id/services',
  authorizeRole(...WAREHOUSE_SERVICE_EXECUTION_ROLES),
  [
    param('id').isUUID(),
    body('serviceId').isUUID(),
    body('performedAt').isISO8601(),
    body('quantity').optional().isFloat({ gt: 0, max: 1000000 }),
    body('comment').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  ],
  handleValidationErrors,
  performWarehouseService,
);

router.patch(
  '/vehicles/:id/services/:performedServiceId',
  authorizeRole(...WAREHOUSE_SERVICE_EXECUTION_ROLES),
  [
    param('id').isUUID(),
    param('performedServiceId').isUUID(),
    body('quantity').optional().isFloat({ gt: 0, max: 1000000 }),
    body('comment').optional({ nullable: true }).isString().trim().isLength({ max: 2000 }),
  ],
  handleValidationErrors,
  correctWarehousePerformedService,
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
    body('receivedDate').optional().isISO8601({ strict: true }),
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

router.patch(
  '/vehicles/:id/operation-times',
  authorizeRole(...WAREHOUSE_DATE_CORRECTION_ROLES),
  [
    param('id').isUUID(),
    body('receivedAt').isISO8601(),
    body('issuedAt').optional({ nullable: true }).isISO8601(),
    body('reason').isString().trim().isLength({ min: 10, max: 1000 }),
  ],
  handleValidationErrors,
  correctWarehouseVehicleDates,
);

router.post(
  '/vehicles/:id/issue',
  authorizeRole(...WAREHOUSE_STAFF_ROLES),
  [
    param('id').isUUID(),
    body('issuedDate').optional().isISO8601({ strict: true }),
    body('issuePhotoIds').isArray({ min: 1, max: 60 }),
    body('issuePhotoIds.*').isUUID(),
  ],
  handleValidationErrors,
  issueWarehouseVehicle,
);

export { router as warehouseRouter };
