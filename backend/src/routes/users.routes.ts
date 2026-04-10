import { Router } from 'express';
import { authenticate } from '../middleware/authenticate';
import { asyncHandler } from '../middleware/error-handler';
import { listUsersDirectory } from '../controllers/users.controller';

const router = Router();

router.use(authenticate);

router.get('/directory', asyncHandler(listUsersDirectory));

export { router as usersRouter };
