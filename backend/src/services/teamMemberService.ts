import {
  ITeamMemberRepository,
  teamMemberRepository,
  TeamMemberEntity,
} from '../repositories/teamMemberRepository';
import { ITeamRepository, teamRepository } from '../repositories/teamRepository';
import { IUserRepository, userRepository } from '../repositories/userRepository';
import { ConflictError, NotFoundError } from '../utils/errors';
import { TeamRole } from '@prisma/client';

export class TeamMemberService {
  constructor(
    private teamMemberRepo: ITeamMemberRepository = teamMemberRepository,
    private teamRepo: ITeamRepository = teamRepository,
    private userRepo: IUserRepository = userRepository
  ) {}

  /**
   * Adds a user to a team with a specified role.
   * Enforces:
   * 1. Team existence (404 TEAM_NOT_FOUND)
   * 2. User existence (404 USER_NOT_FOUND)
   * 3. Membership uniqueness (409 MEMBER_ALREADY_EXISTS)
   */
  async addMember(
    teamId: string,
    userId: string,
    role: TeamRole = TeamRole.MEMBER
  ): Promise<TeamMemberEntity> {
    // 1. Verify team exists
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }

    // 2. Verify user exists
    const user = await this.userRepo.findById(userId);
    if (!user) {
      throw new NotFoundError('User not found.', 'USER_NOT_FOUND');
    }

    // 3. Verify user is not already a member
    const existing = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      userId
    );
    if (existing) {
      throw new ConflictError(
        'User is already a member of this team.',
        'MEMBER_ALREADY_EXISTS'
      );
    }

    // 4. Create membership
    return this.teamMemberRepo.create({
      teamId,
      userId,
      role,
    });
  }

  /**
   * Lists all members of a team.
   */
  async listMembers(teamId: string): Promise<TeamMemberEntity[]> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }

    return this.teamMemberRepo.findMembersByTeamId(teamId);
  }

  /**
   * Removes a member from a team.
   */
  async removeMember(teamId: string, userId: string): Promise<void> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }

    const membership = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      userId
    );
    if (!membership) {
      throw new NotFoundError('Team member not found.', 'MEMBER_NOT_FOUND');
    }

    await this.teamMemberRepo.delete(teamId, userId);
  }
}

export const teamMemberService = new TeamMemberService();
