import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { asyncHandler } from '../middleware/error-handler';
import { FUEL_ROLES } from '../constants/directories';
import {
  exportFuelExcel,
  exportFuelYearExcel,
  getFuelSeasons,
  getFuelState,
  saveFuelSeasons,
  saveFuelState,
  setVehicleBaseline,
} from '../controllers/fuel.controller';

const router = Router();

router.use(authenticate);
router.use(authorizeRole(...FUEL_ROLES));

router.get('/state', asyncHandler(getFuelState));
router.put('/state', asyncHandler(saveFuelState));
router.post('/baseline', asyncHandler(setVehicleBaseline));
router.get('/seasons', asyncHandler(getFuelSeasons));
router.put('/seasons', asyncHandler(saveFuelSeasons));
router.get('/export', asyncHandler(exportFuelExcel));
router.get('/export-year', asyncHandler(exportFuelYearExcel));

export { router as fuelRouter };
