import { Router } from 'express';
import { workItemController } from '../controllers/workItemController';
import { commentController } from '../controllers/commentController';
import { activityController } from '../controllers/activityController';
import { authenticate } from '../middleware/authenticate';
import { validateRequest } from '../middleware/validate';
import {
  updateWorkItemSchema,
  transitionWorkItemSchema,
} from '../validators/workItemValidators';
import { createCommentSchema } from '../validators/commentValidators';
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

// Comments endpoints (Phase 8)
router.post(
  '/:id/comments',
  validateRequest(createCommentSchema),
  commentController.create
);
router.get('/:id/comments', commentController.list);
router.delete('/:id/comments/:commentId', commentController.delete);

// Activity / Audit History endpoint (Phase 8)
router.get('/:id/activity', activityController.list);

export default router;
