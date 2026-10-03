import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);

// Future module routes will be registered here:
// router.use('/auth', authRouter);       // Phase 1
// router.use('/users', usersRouter);     // Phase 2
// router.use('/teams', teamsRouter);     // Phase 2
// router.use('/work-items', workItemsRouter); // Phase 3

export default router;
