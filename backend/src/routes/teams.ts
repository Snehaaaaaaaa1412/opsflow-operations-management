import { Router } from 'express';
import { teamController } from '../controllers/teamController';
import { teamMemberController } from '../controllers/teamMemberController';
import { authenticate } from '../middleware/authenticate';
import { validateRequest } from '../middleware/validate';
import {
  createTeamSchema,
  addTeamMemberSchema,
  updateTeamMemberRoleSchema,
} from '../validators/teamValidators';

const router = Router();

// All team routes require authentication
router.use(authenticate);

// Team CRUD
router.post(
  '/',
  validateRequest(createTeamSchema),
  teamController.create
);

router.get('/', teamController.list);
router.get('/:id', teamController.getById);

// Team Memberships (Phase 2B & 2C)
router.post(
  '/:id/members',
  validateRequest(addTeamMemberSchema),
  teamMemberController.addMember
);

router.get('/:id/members', teamMemberController.listMembers);
router.delete('/:id/members/:userId', teamMemberController.removeMember);
router.patch(
  '/:id/members/:userId',
  validateRequest(updateTeamMemberRoleSchema),
  teamMemberController.updateMemberRole
);

export default router;
