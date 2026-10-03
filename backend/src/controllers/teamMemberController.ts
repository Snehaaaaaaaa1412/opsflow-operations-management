import { Request, Response, NextFunction } from 'express';
import {
  teamMemberService,
  TeamMemberService,
} from '../services/teamMemberService';

/**
 * Controller handling team membership endpoints.
 * Extracts params, payload, and authenticated user ID, delegating logic to TeamMemberService.
 */
export class TeamMemberController {
  constructor(private service: TeamMemberService = teamMemberService) {}

  addMember = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const actorId = req.user!.id;
      const { userId, role } = req.body;
      const member = await this.service.addMember(
        teamId,
        userId,
        role,
        actorId
      );
      res.status(201).json({
        data: member,
      });
    } catch (error) {
      next(error);
    }
  };

  listMembers = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const actorId = req.user!.id;
      const members = await this.service.listMembers(teamId, actorId);
      res.status(200).json({
        data: members,
      });
    } catch (error) {
      next(error);
    }
  };

  removeMember = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const userId = Array.isArray(req.params.userId)
        ? req.params.userId[0]!
        : req.params.userId!;
      const actorId = req.user!.id;
      await this.service.removeMember(teamId, userId, actorId);
      res.status(200).json({
        data: { message: 'Member removed successfully.' },
      });
    } catch (error) {
      next(error);
    }
  };

  updateMemberRole = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const teamId = Array.isArray(req.params.id)
        ? req.params.id[0]!
        : req.params.id!;
      const userId = Array.isArray(req.params.userId)
        ? req.params.userId[0]!
        : req.params.userId!;
      const actorId = req.user!.id;
      const { role } = req.body;
      const updatedMember = await this.service.updateMemberRole(
        teamId,
        userId,
        role,
        actorId
      );
      res.status(200).json({
        data: updatedMember,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const teamMemberController = new TeamMemberController();
