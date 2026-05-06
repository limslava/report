import { Router } from 'express';
import { query } from 'express-validator';
import { authenticate } from '../middleware/authenticate';
import { authorizeRole } from '../middleware/authorize';
import { handleValidationErrors } from '../middleware/express-validator.middleware';
import { resolveCounterpartyByInn, resolveCounterpartyByName } from '../controllers/counterparties.controller';

const router = Router();

router.use(authenticate);
router.use(authorizeRole('admin'));

router.get('/resolve', [query('inn').isString().matches(/^(\d{10}|\d{12}|\d{13}|\d{15})$/)], handleValidationErrors, resolveCounterpartyByInn);
router.get('/resolve-by-name', [query('name').isString().trim().isLength({ min: 2, max: 255 })], handleValidationErrors, resolveCounterpartyByName);

export { router as counterpartiesRouter };
