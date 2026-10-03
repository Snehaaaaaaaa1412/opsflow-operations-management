import { Router } from 'express';
import { workItemController } from '../controllers/workItemController';
import { authenticate } from '../middleware/authenticate';
import { validateRequest } from '../middleware/validate';
import { updateWorkItemSchema } from '../validators/workItemValidators';

const router = Router();

// All work-item routes require authentication
router.use(authenticate);

// Work Item operations by ID
router.get('/:id', workItemController.getById);
router.patch(
  '/:id',
  validateRequest(updateWorkItemSchema),
  workItemController.update
);
router.delete('/:id', workItemController.delete);

export default router;
