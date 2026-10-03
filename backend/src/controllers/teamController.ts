import { Request, Response, NextFunction } from 'express';
import { teamService, TeamService } from '../services/teamService';

/**
 * Controller handling team endpoints.
 * Keeps business logic isolated inside TeamService.
 */
export class TeamController {
  constructor(private service: TeamService = teamService) {}

  create = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const team = await this.service.createTeam(req.body.name, userId);
      res.status(201).json({
        data: team,
      });
    } catch (error) {
      next(error);
    }
  };

  list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const userId = req.user!.id;
      const teams = await this.service.listTeams(userId);
      res.status(200).json({
        data: teams,
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
      const id = Array.isArray(req.params.id) ? req.params.id[0]! : req.params.id;
      const userId = req.user!.id;
      const team = await this.service.getTeamById(id, userId);
      res.status(200).json({
        data: team,
      });
    } catch (error) {
      next(error);
    }
  };
}

export const teamController = new TeamController();
