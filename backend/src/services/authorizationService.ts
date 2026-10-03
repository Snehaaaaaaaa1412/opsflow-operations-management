import {
  ITeamMemberRepository,
  teamMemberRepository,
  TeamMemberEntity,
} from '../repositories/teamMemberRepository';
import { ITeamRepository, teamRepository } from '../repositories/teamRepository';
import { ForbiddenError, NotFoundError } from '../utils/errors';
import { TeamRole } from '@prisma/client';

/**
 * Service centralizing resource-level authorization decisions for Teams and Team Memberships.
 * Enforces explicit role boundaries and keeps permission rules out of controllers.
 */
export class AuthorizationService {
  constructor(
    private teamMemberRepo: ITeamMemberRepository = teamMemberRepository,
    private teamRepo: ITeamRepository = teamRepository
  ) {}

  /**
   * Retrieves the membership of a user in a team, or null if not a member.
   */
  async getTeamMembership(
    userId: string,
    teamId: string
  ): Promise<TeamMemberEntity | null> {
    return this.teamMemberRepo.findByTeamAndUser(teamId, userId);
  }

  /**
   * Enforces that the team exists (404 TEAM_NOT_FOUND) and the user is a member (403 FORBIDDEN).
   * Returns the user's membership entity.
   */
  async requireTeamMember(
    userId: string,
    teamId: string
  ): Promise<TeamMemberEntity> {
    const team = await this.teamRepo.findById(teamId);
    if (!team) {
      throw new NotFoundError('Team not found.', 'TEAM_NOT_FOUND');
    }

    const membership = await this.teamMemberRepo.findByTeamAndUser(
      teamId,
      userId
    );
    if (!membership) {
      throw new ForbiddenError(
        'You do not have access to this team.',
        'FORBIDDEN'
      );
    }

    return membership;
  }

  /**
   * Enforces that the user has one of the allowed roles in the specified team.
   */
  async requireTeamRole(
    userId: string,
    teamId: string,
    allowedRoles: TeamRole[]
  ): Promise<TeamMemberEntity> {
    const membership = await this.requireTeamMember(userId, teamId);

    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenError(
        'You do not have permission to perform this action.',
        'FORBIDDEN'
      );
    }

    return membership;
  }

  /**
   * Determines whether an actor role has permission to add a member with newMemberRole.
   * - ADMIN: can add any member role.
   * - TEAM_LEAD: can add MEMBER only (cannot add or promote someone to ADMIN).
   * - MEMBER: cannot add any members.
   */
  canAddMember(actorRole: TeamRole, newMemberRole: TeamRole): boolean {
    if (actorRole === TeamRole.ADMIN) {
      return true;
    }
    if (actorRole === TeamRole.TEAM_LEAD) {
      return newMemberRole !== TeamRole.ADMIN;
    }
    return false;
  }

  /**
   * Determines whether an actor role has permission to remove a target member.
   * - ADMIN: can remove any member.
   * - TEAM_LEAD: can remove MEMBER only (cannot remove ADMIN or another TEAM_LEAD).
   * - MEMBER: cannot remove anyone.
   */
  canRemoveMember(actorRole: TeamRole, targetRole: TeamRole): boolean {
    if (actorRole === TeamRole.ADMIN) {
      return true;
    }
    if (actorRole === TeamRole.TEAM_LEAD) {
      return targetRole === TeamRole.MEMBER;
    }
    return false;
  }

  /**
   * Determines whether an actor role has permission to change a member's role from currentRole to newRole.
   * - ADMIN: can change any member's role to any valid role.
   * - TEAM_LEAD:
   *     - can change MEMBER role only (cannot change ADMIN or another TEAM_LEAD)
   *     - cannot assign ADMIN role
   * - MEMBER: cannot change roles.
   */
  canChangeRole(
    actorRole: TeamRole,
    currentRole: TeamRole,
    newRole: TeamRole
  ): boolean {
    if (actorRole === TeamRole.ADMIN) {
      return true;
    }
    if (actorRole === TeamRole.TEAM_LEAD) {
      if (currentRole !== TeamRole.MEMBER) {
        return false;
      }
      if (newRole === TeamRole.ADMIN) {
        return false;
      }
      return true;
    }
    return false;
  }
}

export const authorizationService = new AuthorizationService();
