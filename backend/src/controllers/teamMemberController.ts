import { Request, Response, NextFunction } from 'express';
import {
  teamMemberService,
  TeamMemberService,
} from '../services/teamMemberService';

/**
 * Controller handling team membership endpoints.
 * Keeps business logic isolated inside TeamMemberService.
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
      const { userId, role } = req.body;
      const member = await this.service.addMember(teamId, userId, role);
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
      const members = await this.service.listMembers(teamId);
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
      await this.service.removeMember(teamId, userId);
      res.status(200).json({
        data: { message: 'Member removed successfully.' },
      });
    } catch (error) {
      next(error);
    }
  };
}

export const teamMemberController = new TeamMemberController();
