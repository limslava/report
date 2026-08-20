import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { asyncHandler } from '../middleware/error-handler';
import {
  DIRECTORY_DELETE_ROLES,
  DIRECTORY_EDIT_ROLES,
  DIRECTORY_ROLES,
  FLEET_VIEW_ROLES,
  FUEL_ROLES,
} from '../constants/directories';
import {
  bootstrapDirectoriesFromSchedules,
  exportDirectory,
  getDirectoryOptions,
  deleteEmployee,
  deleteTrailer,
  deleteVehicle,
  deleteVehicleModel,
  findEmployeeCardByName,
  getEmployeeCardText,
  listEmployees,
  listTrailers,
  listVehicleModels,
  listVehicles,
  saveEmployee,
  saveTrailer,
  saveVehicle,
  saveVehicleModel,
} from '../controllers/directories.controller';

const router = Router();

router.use(authenticate);

// Модели и нормы: читают все причастные, пишут БДД/рук. КТК/админ (проверка в контроллере)
router.get('/models', authorizeRole(...FLEET_VIEW_ROLES), asyncHandler(listVehicleModels));
router.post('/models', authorizeRole(...FUEL_ROLES), asyncHandler(saveVehicleModel));
router.put('/models/:id', authorizeRole(...FUEL_ROLES), asyncHandler(saveVehicleModel));
router.delete('/models/:id', authorizeRole(...DIRECTORY_DELETE_ROLES), asyncHandler(deleteVehicleModel));

// Техника: просмотр — справочные роли + роли топлива; запись — справочные роли
router.get('/vehicles', authorizeRole(...FLEET_VIEW_ROLES), asyncHandler(listVehicles));
router.post('/vehicles', authorizeRole(...DIRECTORY_EDIT_ROLES), asyncHandler(saveVehicle));
router.put('/vehicles/:id', authorizeRole(...DIRECTORY_EDIT_ROLES), asyncHandler(saveVehicle));
router.delete('/vehicles/:id', authorizeRole(...DIRECTORY_DELETE_ROLES), asyncHandler(deleteVehicle));

// Прицепы
router.get('/trailers', authorizeRole(...FLEET_VIEW_ROLES), asyncHandler(listTrailers));
router.post('/trailers', authorizeRole(...DIRECTORY_EDIT_ROLES), asyncHandler(saveTrailer));
router.put('/trailers/:id', authorizeRole(...DIRECTORY_EDIT_ROLES), asyncHandler(saveTrailer));
router.delete('/trailers/:id', authorizeRole(...DIRECTORY_DELETE_ROLES), asyncHandler(deleteTrailer));

// Сотрудники (ПДн): только справочные роли, БДД доступа не имеют
router.get('/employees', authorizeRole(...DIRECTORY_ROLES), asyncHandler(listEmployees));
router.post('/employees', authorizeRole(...DIRECTORY_EDIT_ROLES), asyncHandler(saveEmployee));
router.put('/employees/:id', authorizeRole(...DIRECTORY_EDIT_ROLES), asyncHandler(saveEmployee));
router.delete('/employees/:id', authorizeRole(...DIRECTORY_DELETE_ROLES), asyncHandler(deleteEmployee));
router.get('/employees/card-by-name', authorizeRole(...DIRECTORY_ROLES), asyncHandler(findEmployeeCardByName));
router.get('/employees/:id/card-text', authorizeRole(...DIRECTORY_ROLES), asyncHandler(getEmployeeCardText));

// подсказки для диалогов графиков — роли, редактирующие графики
router.get(
  '/options',
  authorizeRole(
    'admin',
    'manager_ktk_vvo',
    'head_ktk_vvo',
    'manager_ktk_mow',
    'head_ktk_mow',
    'head_hr',
    'hr_specialist',
    'garage_head_vvo',
    'garage_head',
    'warehouse_manager_vvo',
    'manager_to',
    'security'
  ),
  asyncHandler(getDirectoryOptions)
);

// экспорт: водители — только справочные роли (проверка в контроллере), остальное — и роли топлива
router.post('/export', authorizeRole(...FLEET_VIEW_ROLES), asyncHandler(exportDirectory));

router.post('/bootstrap-from-schedules', authorizeRole('admin'), asyncHandler(bootstrapDirectoriesFromSchedules));

export { router as directoriesRouter };
