import {
  ITeamRepository,
  teamRepository,
  TeamEntity,
} from '../repositories/teamRepository';
import {
  ITeamMemberRepository,
  teamMemberRepository,
} from '../repositories/teamMemberRepository';
import {
  AuthorizationService,
  authorizationService,
} from './authorizationService';
import { ConflictError, NotFoundError } from '../utils/errors';
import { TeamRole } from '@prisma/client';

export class TeamService {
  constructor(
    private teamRepo: ITeamRepository = teamRepository,
    private teamMemberRepo: ITeamMemberRepository = teamMemberRepository,
    private authzService: AuthorizationService = authorizationService
  ) {}

  /**
   * Creates a new team with the authenticated user as the creator.
   * Ensures team name uniqueness.
   * Automatically adds the creator as an ADMIN member of the team.
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

    const team = await this.teamRepo.create({
      name: trimmedName,
      createdById: userId,
    });

    // Creator automatically becomes an ADMIN member of the team
    await this.teamMemberRepo.create({
      teamId: team.id,
      userId,
      role: TeamRole.ADMIN,
    });

    return team;
  }

  /**
   * Lists all teams the authenticated user belongs to.
   * Resource isolation rule: users can only see their own teams.
   */
  async listTeams(userId: string): Promise<TeamEntity[]> {
    return this.teamRepo.findByUserId(userId);
  }

  /**
   * Retrieves a specific team by its ID.
   * Enforces resource-level authorization:
   * 1. 404 TEAM_NOT_FOUND if team does not exist.
   * 2. 403 FORBIDDEN if user is not a member of the team.
   */
  async getTeamById(id: string, userId: string): Promise<TeamEntity> {
    // Verifies team existence (404) and user membership (403)
    await this.authzService.requireTeamMember(userId, id);

    const team = await this.teamRepo.findById(id);
    if (!team) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }
    return team;
  }
}

export const teamService = new TeamService();
