import {
  IWorkItemRepository,
  workItemRepository,
  WorkItemEntity,
} from '../repositories/workItemRepository';
import { ITeamRepository, teamRepository } from '../repositories/teamRepository';
import {
  ITeamMemberRepository,
  teamMemberRepository,
} from '../repositories/teamMemberRepository';
import { IUserRepository, userRepository } from '../repositories/userRepository';
import {
  AuthorizationService,
  authorizationService,
} from './authorizationService';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
} from '../utils/errors';
import { TeamRole } from '@prisma/client';
import {
  CreateWorkItemInput,
  UpdateWorkItemInput,
} from '../validators/workItemValidators';

export class WorkItemService {
  constructor(
    private workItemRepo: IWorkItemRepository = workItemRepository,
    private teamRepo: ITeamRepository = teamRepository,
    private teamMemberRepo: ITeamMemberRepository = teamMemberRepository,
    private userRepo: IUserRepository = userRepository,
    private authzService: AuthorizationService = authorizationService
  ) {}

  /**
   * Creates a new work item for a team.
   * Enforces:
   * 1. Team existence & creator membership (404 / 403)
   * 2. If assignee is specified: user existence (404) & assignee team membership (400)
   * 3. Initial status is OPEN, default priority is MEDIUM
   * 4. Server-controlled creatorId, teamId, version
   */
  async createWorkItem(
    teamId: string,
    creatorId: string,
    input: CreateWorkItemInput
  ): Promise<WorkItemEntity> {
    // 1. Verify team exists and creator is a member of the team
    await this.authzService.requireTeamMember(creatorId, teamId);

    // 2. If assigneeId is provided, verify assignee exists and belongs to the same team
    if (input.assigneeId) {
      const assigneeUser = await this.userRepo.findById(input.assigneeId);
      if (!assigneeUser) {
        throw new NotFoundError('Assignee user not found.', 'USER_NOT_FOUND');
      }

      const assigneeMembership =
        await this.teamMemberRepo.findByTeamAndUser(teamId, input.assigneeId);
      if (!assigneeMembership) {
        throw new BadRequestError(
          'Assignee must be a member of the team.',
          'INVALID_ASSIGNEE'
        );
      }
    }

    // 3. Create the work item
    return this.workItemRepo.create({
      title: input.title,
      description: input.description,
      priority: input.priority,
      teamId,
      createdById: creatorId,
      assigneeId: input.assigneeId,
    });
  }

  /**
   * Retrieves a work item by ID.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Requester team membership (403 FORBIDDEN)
   */
  async getWorkItem(
    workItemId: string,
    requesterId: string
  ): Promise<WorkItemEntity> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError(
        'Work item not found.',
        'WORK_ITEM_NOT_FOUND'
      );
    }

    // Requester must belong to the work item's team
    await this.authzService.requireTeamMember(requesterId, workItem.teamId);

    return workItem;
  }

  /**
   * Lists all work items belonging to a specific team.
   * Enforces:
   * 1. Team existence & requester team membership (404 / 403)
   */
  async listWorkItems(
    teamId: string,
    requesterId: string
  ): Promise<WorkItemEntity[]> {
    // Verify team exists and requester is a member
    await this.authzService.requireTeamMember(requesterId, teamId);

    return this.workItemRepo.findByTeamId(teamId);
  }

  /**
   * Updates basic fields of a work item (title, description, priority, assigneeId).
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Requester team membership (403 FORBIDDEN)
   * 3. If assigneeId is provided: assignee existence & membership in same team (404 / 400)
   * 4. Does not allow status changes through this generic endpoint
   */
  async updateWorkItem(
    workItemId: string,
    requesterId: string,
    input: UpdateWorkItemInput
  ): Promise<WorkItemEntity> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError(
        'Work item not found.',
        'WORK_ITEM_NOT_FOUND'
      );
    }

    // Requester must belong to the work item's team
    await this.authzService.requireTeamMember(requesterId, workItem.teamId);

    // If assigneeId is provided and non-null, verify assignee belongs to the same team
    if (input.assigneeId !== undefined && input.assigneeId !== null) {
      const assigneeUser = await this.userRepo.findById(input.assigneeId);
      if (!assigneeUser) {
        throw new NotFoundError('Assignee user not found.', 'USER_NOT_FOUND');
      }

      const assigneeMembership =
        await this.teamMemberRepo.findByTeamAndUser(
          workItem.teamId,
          input.assigneeId
        );
      if (!assigneeMembership) {
        throw new BadRequestError(
          'Assignee must be a member of the team.',
          'INVALID_ASSIGNEE'
        );
      }
    }

    return this.workItemRepo.update(workItemId, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      assigneeId: input.assigneeId,
    });
  }

  /**
   * Deletes a work item.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Requester team membership (403 FORBIDDEN)
   * 3. Role authorization: ADMIN and TEAM_LEAD can delete; MEMBER cannot (403 FORBIDDEN)
   */
  async deleteWorkItem(
    workItemId: string,
    requesterId: string
  ): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError(
        'Work item not found.',
        'WORK_ITEM_NOT_FOUND'
      );
    }

    // Requester must belong to the work item's team
    const membership = await this.authzService.requireTeamMember(
      requesterId,
      workItem.teamId
    );

    // Role check: Only ADMIN and TEAM_LEAD can delete work items
    if (
      membership.role !== TeamRole.ADMIN &&
      membership.role !== TeamRole.TEAM_LEAD
    ) {
      throw new ForbiddenError(
        'You do not have permission to delete work items.',
        'FORBIDDEN'
      );
    }

    await this.workItemRepo.delete(workItemId);
  }
}

export const workItemService = new WorkItemService();
