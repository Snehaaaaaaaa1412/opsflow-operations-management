import { Router } from 'express';
import { teamController } from '../controllers/teamController';
import { authenticate } from '../middleware/authenticate';
import { validateRequest } from '../middleware/validate';
import { createTeamSchema } from '../validators/teamValidators';

const router = Router();

// All team routes require authentication
router.use(authenticate);

router.post(
  '/',
  validateRequest(createTeamSchema),
  teamController.create
);

router.get('/', teamController.list);
router.get('/:id', teamController.getById);

export default router;
