import { ITeamRepository, teamRepository, TeamEntity } from '../repositories/teamRepository';
import { ConflictError, NotFoundError } from '../utils/errors';

export class TeamService {
  constructor(private teamRepo: ITeamRepository = teamRepository) {}

  /**
   * Creates a new team with the authenticated user as the creator.
   * Ensures team name uniqueness.
   */
  async createTeam(name: string, userId: string): Promise<TeamEntity> {
    const trimmedName = name.trim();

    // Check if team with this name already exists
    const existing = await this.teamRepo.findByName(trimmedName);
    if (existing) {
      throw new ConflictError(
        'A team with this name already exists.',
        'TEAM_ALREADY_EXISTS'
      );
    }

    return this.teamRepo.create({
      name: trimmedName,
      createdById: userId,
    });
  }

  /**
   * Lists all existing teams.
   */
  async listTeams(): Promise<TeamEntity[]> {
    return this.teamRepo.findAll();
  }

  /**
   * Retrieves a specific team by its ID.
   */
  async getTeamById(id: string): Promise<TeamEntity> {
    const team = await this.teamRepo.findById(id);
    if (!team) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }
    return team;
  }
}

export const teamService = new TeamService();
