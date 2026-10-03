import { Router } from 'express';
import { authController } from '../controllers/authController';
import { validateRequest } from '../middleware/validate';
import { registerSchema } from '../validators/authValidators';

const router = Router();

router.post(
  '/register',
  validateRequest(registerSchema),
  authController.register
);

export default router;
