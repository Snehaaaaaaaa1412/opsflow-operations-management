import { Request, Response, NextFunction } from 'express';
import {
  workItemService,
  WorkItemService,
} from '../services/workItemService';

/**
 * Controller handling work item endpoints.
 * Keeps controllers thin by delegating business logic to WorkItemService.
 */
export class WorkItemController {
  constructor(private service: WorkItemService = workItemService) {}

  create = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawTeamId = req.params.teamId || req.params.id;
      const teamId = Array.isArray(rawTeamId) ? rawTeamId[0]! : rawTeamId!;
      const creatorId = req.user!.id;
      const workItem = await this.service.createWorkItem(
        teamId,
        creatorId,
        req.body
      );
      res.status(201).json({
        data: workItem,
      });
    } catch (error) {
      next(error);
    }
  };

  getById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const requesterId = req.user!.id;
      const workItem = await this.service.getWorkItem(id, requesterId);
      res.status(200).json({
        data: workItem,
      });
    } catch (error) {
      next(error);
    }
  };

  listByTeam = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const rawTeamId = req.params.teamId || req.params.id;
      const teamId = Array.isArray(rawTeamId) ? rawTeamId[0]! : rawTeamId!;
      const requesterId = req.user!.id;
      const result = await this.service.listWorkItems(
        teamId,
        requesterId,
        req.query as any
      );
      res.status(200).json({
        data: result.data || result,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  };

  update = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const requesterId = req.user!.id;
      const workItem = await this.service.updateWorkItem(
        id,
        requesterId,
        req.body
      );
      res.status(200).json({
        data: workItem,
      });
    } catch (error) {
      next(error);
    }
  };

  delete = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const requesterId = req.user!.id;
      await this.service.deleteWorkItem(id, requesterId);
      res.status(200).json({
        data: { message: 'Work item deleted successfully.' },
      });
    } catch (error) {
      next(error);
    }
  };

  transitionStatus = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const id = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const requesterId = req.user!.id;
      const targetStatus = req.body.status || req.body.toStatus;
      const workItem = await this.service.transitionWorkItemStatus(
        id,
        requesterId,
        targetStatus,
        req.body.version
      );
      res.status(200).json({
        data: workItem,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const workItemController = new WorkItemController();
