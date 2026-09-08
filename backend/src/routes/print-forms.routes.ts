import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { asyncHandler } from '../middleware/error-handler';
import { PRINT_FORM_ROLES } from '../constants/directories';
import {
  downloadPrintFormAgain,
  generatePrintForm,
  getPrintFormsMeta,
  listPrintFormsJournal,
} from '../controllers/print-forms.controller';

const router = Router();

router.use(authenticate);
// печать = чтение ПДн водителей, поэтому круг ролей тот же, что у справочников
router.use(authorizeRole(...PRINT_FORM_ROLES));

router.get('/meta', asyncHandler(getPrintFormsMeta));
router.post('/generate', asyncHandler(generatePrintForm));
router.get('/journal', asyncHandler(listPrintFormsJournal));
router.post('/journal/:id/download', asyncHandler(downloadPrintFormAgain));

export { router as printFormsRouter };
