import {
  ITeamMemberRepository,
  teamMemberRepository,
  TeamMemberEntity,
} from '../repositories/teamMemberRepository';
import { ITeamRepository, teamRepository } from '../repositories/teamRepository';
import { IUserRepository, userRepository } from '../repositories/userRepository';
import {
  AuthorizationService,
  authorizationService,
} from './authorizationService';
import { ConflictError, NotFoundError, ForbiddenError } from '../utils/errors';
import { TeamRole } from '@prisma/client';

export class TeamMemberService {
  constructor(
    private teamMemberRepo: ITeamMemberRepository = teamMemberRepository,
    private teamRepo: ITeamRepository = teamRepository,
    private userRepo: IUserRepository = userRepository,
    private authzService: AuthorizationService = authorizationService
  ) {}

  /**
   * Adds a user to a team with a specified role.
   * Enforces:
   * 1. Team existence & actor team membership (404 / 403)
   * 2. Actor role authorization (ADMIN can add any; TEAM_LEAD can add MEMBER; MEMBER cannot add)
   * 3. Target user existence (404 USER_NOT_FOUND)
   * 4. Membership uniqueness (409 MEMBER_ALREADY_EXISTS)
   */
  async addMember(
    teamId: string,
    targetUserId: string,
    role: TeamRole = TeamRole.MEMBER,
    actorId: string
  ): Promise<TeamMemberEntity> {
    // 1. Verify team exists and actor is a member
    const actorMembership = await this.authzService.requireTeamMember(
      actorId,
      teamId
    );

    // 2. Verify actor has permission to add member with requested role
    if (!this.authzService.canAddMember(actorMembership.role, role)) {
      throw new ForbiddenError(
        'You do not have permission to add members with this role.',
        'FORBIDDEN'
      );
    }

    // 3. Verify target user exists
    const user = await this.userRepo.findById(targetUserId);
    if (!user) {
      throw new NotFoundError('User not found.', 'USER_NOT_FOUND');
    }

    // 4. Verify user is not already a member
    const existing = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      targetUserId
    );
    if (existing) {
      throw new ConflictError(
        'User is already a member of this team.',
        'MEMBER_ALREADY_EXISTS'
      );
    }

    // 5. Create membership
    return this.teamMemberRepo.create({
      teamId,
      userId: targetUserId,
      role,
    });
  }

  /**
   * Lists all members of a team.
   * Enforces:
   * 1. Team existence & actor team membership (404 / 403)
   */
  async listMembers(
    teamId: string,
    actorId: string
  ): Promise<TeamMemberEntity[]> {
    // Verify team exists and actor is a member
    await this.authzService.requireTeamMember(actorId, teamId);

    return this.teamMemberRepo.findMembersByTeamId(teamId);
  }

  /**
   * Removes a member from a team.
   * Enforces:
   * 1. Team existence & actor team membership (404 / 403)
   * 2. Target membership existence (404 MEMBER_NOT_FOUND)
   * 3. Actor role authorization (ADMIN can remove any; TEAM_LEAD can remove MEMBER; MEMBER cannot remove)
   */
  async removeMember(
    teamId: string,
    targetUserId: string,
    actorId: string
  ): Promise<void> {
    // 1. Verify team exists and actor is a member
    const actorMembership = await this.authzService.requireTeamMember(
      actorId,
      teamId
    );

    // 2. Verify target member exists in this team
    const targetMembership = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      targetUserId
    );
    if (!targetMembership) {
      throw new NotFoundError('Team member not found.', 'MEMBER_NOT_FOUND');
    }

    // 3. Verify actor has permission to remove target member
    if (
      !this.authzService.canRemoveMember(
        actorMembership.role,
        targetMembership.role
      )
    ) {
      throw new ForbiddenError(
        'You do not have permission to remove this member.',
        'FORBIDDEN'
      );
    }

    await this.teamMemberRepo.delete(teamId, targetUserId);
  }

  /**
   * Updates a member's role in a team.
   * Enforces:
   * 1. Team existence & actor team membership (404 / 403)
   * 2. Target membership existence (404 MEMBER_NOT_FOUND)
   * 3. Actor role authorization (ADMIN can change any; TEAM_LEAD can change MEMBER only to non-ADMIN; MEMBER cannot change)
   */
  async updateMemberRole(
    teamId: string,
    targetUserId: string,
    newRole: TeamRole,
    actorId: string
  ): Promise<TeamMemberEntity> {
    // 1. Verify team exists and actor is a member
    const actorMembership = await this.authzService.requireTeamMember(
      actorId,
      teamId
    );

    // 2. Verify target member exists in this team
    const targetMembership = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      targetUserId
    );
    if (!targetMembership) {
      throw new NotFoundError('Team member not found.', 'MEMBER_NOT_FOUND');
    }

    // 3. Verify actor has permission to change target member's role
    if (
      !this.authzService.canChangeRole(
        actorMembership.role,
        targetMembership.role,
        newRole
      )
    ) {
      throw new ForbiddenError(
        'You do not have permission to change this member\'s role.',
        'FORBIDDEN'
      );
    }

    return this.teamMemberRepo.updateRole(teamId, targetUserId, newRole);
  }
}

export const teamMemberService = new TeamMemberService();
