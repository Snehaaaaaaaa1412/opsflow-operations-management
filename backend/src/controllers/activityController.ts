import { Request, Response, NextFunction } from 'express';
import {
  ActivityService,
  activityService as defaultActivityService,
} from '../services/activityService';

export class ActivityController {
  constructor(private service: ActivityService = defaultActivityService) {}

  list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawWorkItemId = req.params.id || req.params.workItemId;
      const workItemId = Array.isArray(rawWorkItemId)
        ? rawWorkItemId[0]!
        : rawWorkItemId!;
      const requesterId = req.user!.id;

      const activities = await this.service.getActivityHistory(
        workItemId,
        requesterId
      );

      res.status(200).json({
        data: activities,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const activityController = new ActivityController();
