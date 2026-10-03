import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth';
import teamsRouter from './teams';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/teams', teamsRouter);

// Future module routes will be registered here:
// router.use('/users', usersRouter);     // Phase 2
// router.use('/work-items', workItemsRouter); // Phase 3

export default router;
