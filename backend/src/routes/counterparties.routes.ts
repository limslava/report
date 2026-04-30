import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { resolveCounterpartyByInn } from '../controllers/counterparties.controller';

const router = Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/resolve', [query('inn').isString().matches(/^\d{10}$|^\d{12}$/)], handleValidationErrors, resolveCounterpartyByInn);

export { router as counterpartiesRouter };
