import { Router } from 'express';
import { workItemController } from '../controllers/workItemController';
import { authenticate } from '../middleware/authenticate';
import { validateRequest } from '../middleware/validate';
import {
  updateWorkItemSchema,
  transitionWorkItemSchema,
} from '../validators/workItemValidators';
import { idempotency } from '../middleware/idempotency';

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

// Status transition endpoints (Phase 4/5 & Phase 7 Idempotency)
router.post(
  '/:id/transition',
  idempotency(),
  validateRequest(transitionWorkItemSchema),
  workItemController.transitionStatus
);
router.patch(
  '/:id/status',
  idempotency(),
  validateRequest(transitionWorkItemSchema),
  workItemController.transitionStatus
);

export default router;
