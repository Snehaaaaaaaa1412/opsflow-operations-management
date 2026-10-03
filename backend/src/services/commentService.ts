import {
  ICommentRepository,
  commentRepository,
  CommentEntity,
} from '../repositories/commentRepository';
import {
  IWorkItemRepository,
  workItemRepository,
} from '../repositories/workItemRepository';
import {
  IActivityRepository,
  activityRepository,
} from '../repositories/activityRepository';
import {
  AuthorizationService,
  authorizationService,
} from './authorizationService';
import {
  NotFoundError,
  ForbiddenError,
  BadRequestError,
} from '../utils/errors';
import { TeamRole } from '@prisma/client';

export class CommentService {
  constructor(
    private commentRepo: ICommentRepository = commentRepository,
    private workItemRepo: IWorkItemRepository = workItemRepository,
    private activityRepo: IActivityRepository = activityRepository,
    private authzService: AuthorizationService = authorizationService
  ) {}

  /**
   * Adds a comment to a work item.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Author must be a member of the work item's team (403 FORBIDDEN)
   * 3. Author comes strictly from authenticated user id (server-enforced)
   * 4. Logs COMMENT_ADDED activity audit entry
   */
  async addComment(
    workItemId: string,
    authorId: string,
    content: string
  ): Promise<CommentEntity> {
    const trimmed = content ? content.trim() : '';
    if (!trimmed || trimmed.length > 2000) {
      throw new BadRequestError(
        'Comment content must be between 1 and 2000 characters.',
        'INVALID_COMMENT_CONTENT'
      );
    }

    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError('Work item not found.', 'WORK_ITEM_NOT_FOUND');
    }

    // Author must belong to the work item's team
    await this.authzService.requireTeamMember(authorId, workItem.teamId);

    const comment = await this.commentRepo.create({
      workItemId,
      authorId,
      body: trimmed,
    });

    // Record activity audit entry
    await this.activityRepo.create({
      workItemId,
      actorId: authorId,
      action: 'COMMENT_ADDED',
      metadata: { commentId: comment.id },
    });

    return comment;
  }

  /**
   * Lists all comments on a work item.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Requester must be a member of the work item's team (403 FORBIDDEN)
   */
  async getComments(
    workItemId: string,
    requesterId: string
  ): Promise<CommentEntity[]> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError('Work item not found.', 'WORK_ITEM_NOT_FOUND');
    }

    await this.authzService.requireTeamMember(requesterId, workItem.teamId);

    return this.commentRepo.findByWorkItemId(workItemId);
  }

  /**
   * Deletes a comment.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Comment existence & belongs to work item (404 COMMENT_NOT_FOUND)
   * 3. Requester team membership (403 FORBIDDEN)
   * 4. Requester must be the comment author OR team leadership (ADMIN/TEAM_LEAD) (403 FORBIDDEN)
   * 5. Logs COMMENT_DELETED activity audit entry
   */
  async deleteComment(
    workItemId: string,
    commentId: string,
    requesterId: string
  ): Promise<void> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError('Work item not found.', 'WORK_ITEM_NOT_FOUND');
    }

    const membership = await this.authzService.requireTeamMember(
      requesterId,
      workItem.teamId
    );

    const comment = await this.commentRepo.findById(commentId);
    if (!comment || comment.workItemId !== workItemId) {
      throw new NotFoundError('Comment not found.', 'COMMENT_NOT_FOUND');
    }

    const isAuthor = comment.authorId === requesterId;
    const isLeadership =
      membership.role === TeamRole.ADMIN ||
      membership.role === TeamRole.TEAM_LEAD;

    if (!isAuthor && !isLeadership) {
      throw new ForbiddenError(
        'You do not have permission to delete this comment.',
        'FORBIDDEN'
      );
    }

    await this.commentRepo.delete(commentId);

    // Record activity audit entry
    await this.activityRepo.create({
      workItemId,
      actorId: requesterId,
      action: 'COMMENT_DELETED',
      metadata: { commentId },
    });
  }
}

export const commentService = new CommentService();
