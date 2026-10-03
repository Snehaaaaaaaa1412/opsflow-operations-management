import { Router } from 'express';
import healthRouter from './health';
import authRouter from './auth';
import teamsRouter from './teams';
import workItemsRouter from './workItems';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/teams', teamsRouter);
router.use('/work-items', workItemsRouter);

export default router;
