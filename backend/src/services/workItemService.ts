import {
  IWorkItemRepository,
  workItemRepository,
  WorkItemEntity,
  PaginatedWorkItemsResult,
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
  IActivityRepository,
  activityRepository,
} from '../repositories/activityRepository';
import {
  BadRequestError,
  NotFoundError,
  ForbiddenError,
  ConflictError,
} from '../utils/errors';
import { TeamRole, WorkItemStatus } from '@prisma/client';
import {
  CreateWorkItemInput,
  UpdateWorkItemInput,
  ListWorkItemsQueryInput,
} from '../validators/workItemValidators';

export class WorkItemService {
  constructor(
    private workItemRepo: IWorkItemRepository = workItemRepository,
    private teamRepo: ITeamRepository = teamRepository,
    private teamMemberRepo: ITeamMemberRepository = teamMemberRepository,
    private userRepo: IUserRepository = userRepository,
    private authzService: AuthorizationService = authorizationService,
    private activityRepo: IActivityRepository = activityRepository
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
    const created = await this.workItemRepo.create({
      title: input.title,
      description: input.description,
      priority: input.priority,
      teamId,
      createdById: creatorId,
      assigneeId: input.assigneeId,
    });

    // 4. Record activity audit entry
    await this.activityRepo.create({
      workItemId: created.id,
      actorId: creatorId,
      action: 'WORK_ITEM_CREATED',
      metadata: {
        title: created.title,
        priority: created.priority,
        status: created.status,
      },
    });

    return created;
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
   * Lists work items belonging to a specific team with optional
   * database-level search, filtering, sorting, and pagination.
   * Enforces:
   * 1. Team existence & requester team membership (404 / 403)
   */
  async listWorkItems(
    teamId: string,
    requesterId: string,
    query: ListWorkItemsQueryInput = {}
  ): Promise<PaginatedWorkItemsResult> {
    // Verify team exists and requester is a member
    await this.authzService.requireTeamMember(requesterId, teamId);

    return this.workItemRepo.findByTeamId(teamId, query);
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

    // Stale update protection
    if (workItem.version !== input.version) {
      throw new ConflictError(
        'The work item has been modified since it was last read.',
        'STALE_WORK_ITEM'
      );
    }

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

    const assigneeChanged =
      input.assigneeId !== undefined && input.assigneeId !== workItem.assigneeId;
    const attributesChanged =
      (input.title !== undefined && input.title !== workItem.title) ||
      (input.description !== undefined && input.description !== workItem.description) ||
      (input.priority !== undefined && input.priority !== workItem.priority);

    const updated = await this.workItemRepo.updateWithVersion(workItemId, input.version, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      assigneeId: input.assigneeId,
    });

    if (assigneeChanged) {
      await this.activityRepo.create({
        workItemId,
        actorId: requesterId,
        action: 'ASSIGNEE_CHANGED',
        metadata: {
          from: workItem.assigneeId,
          to: input.assigneeId ?? null,
        },
      });
    }

    if (attributesChanged) {
      const changes: Record<string, { from: unknown; to: unknown }> = {};
      if (input.title !== undefined && input.title !== workItem.title) {
        changes.title = { from: workItem.title, to: input.title };
      }
      if (
        input.description !== undefined &&
        input.description !== workItem.description
      ) {
        changes.description = {
          from: workItem.description,
          to: input.description,
        };
      }
      if (input.priority !== undefined && input.priority !== workItem.priority) {
        changes.priority = { from: workItem.priority, to: input.priority };
      }
      await this.activityRepo.create({
        workItemId,
        actorId: requesterId,
        action: 'WORK_ITEM_UPDATED',
        metadata: { changes },
      });
    }

    return updated;
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

    await this.activityRepo.create({
      workItemId,
      actorId: requesterId,
      action: 'WORK_ITEM_DELETED',
      metadata: {
        title: workItem.title,
      },
    });

    await this.workItemRepo.delete(workItemId);
  }

  /**
   * Transitions a work item's status following strict state machine rules
   * and optimistic concurrency version checking.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Requester team membership (403 FORBIDDEN)
   * 3. Cannot transition to identical status (400 INVALID_STATUS_TRANSITION)
   * 4. State machine allowed transitions (400 INVALID_STATUS_TRANSITION)
   * 5. Stale update protection via expectedVersion (409 STALE_WORK_ITEM)
   */
  async transitionWorkItemStatus(
    workItemId: string,
    requesterId: string,
    targetStatus: WorkItemStatus,
    expectedVersion: number
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

    // Reject transitions to the same status
    if (workItem.status === targetStatus) {
      throw new BadRequestError(
        `Work item is already in status '${targetStatus}'.`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Check allowed state machine transitions
    const allowed = ALLOWED_STATUS_TRANSITIONS[workItem.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestError(
        `Invalid status transition from '${workItem.status}' to '${targetStatus}'. Allowed transitions: ${allowed.join(', ')}.`,
        'INVALID_STATUS_TRANSITION'
      );
    }

    // Stale update protection
    if (workItem.version !== expectedVersion) {
      throw new ConflictError(
        'The work item has been modified since it was last read.',
        'STALE_WORK_ITEM'
      );
    }

    const updated = await this.workItemRepo.updateStatusWithVersion(
      workItemId,
      expectedVersion,
      targetStatus
    );

    await this.activityRepo.create({
      workItemId,
      actorId: requesterId,
      action: 'STATUS_CHANGED',
      metadata: {
        from: workItem.status,
        to: targetStatus,
        version: updated.version,
      },
    });

    return updated;
  }
}

export const ALLOWED_STATUS_TRANSITIONS: Record<
  WorkItemStatus,
  WorkItemStatus[]
> = {
  [WorkItemStatus.OPEN]: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.BLOCKED,
    WorkItemStatus.CLOSED,
  ],
  [WorkItemStatus.IN_PROGRESS]: [
    WorkItemStatus.OPEN,
    WorkItemStatus.BLOCKED,
    WorkItemStatus.RESOLVED,
  ],
  [WorkItemStatus.BLOCKED]: [
    WorkItemStatus.OPEN,
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.CLOSED,
  ],
  [WorkItemStatus.RESOLVED]: [
    WorkItemStatus.IN_PROGRESS,
    WorkItemStatus.CLOSED,
  ],
  [WorkItemStatus.CLOSED]: [
    WorkItemStatus.OPEN,
  ],
};

export const workItemService = new WorkItemService();
