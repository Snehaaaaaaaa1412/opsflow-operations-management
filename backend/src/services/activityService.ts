import {
  IActivityRepository,
  activityRepository,
  ActivityEntity,
} from '../repositories/activityRepository';
import {
  IWorkItemRepository,
  workItemRepository,
} from '../repositories/workItemRepository';
import {
  AuthorizationService,
  authorizationService,
} from './authorizationService';
import { NotFoundError } from '../utils/errors';

export class ActivityService {
  constructor(
    private activityRepo: IActivityRepository = activityRepository,
    private workItemRepo: IWorkItemRepository = workItemRepository,
    private authzService: AuthorizationService = authorizationService
  ) {}

  /**
   * Retrieves the chronological activity history of a work item.
   * Enforces:
   * 1. Work item existence (404 WORK_ITEM_NOT_FOUND)
   * 2. Requester team membership (403 FORBIDDEN)
   */
  async getActivityHistory(
    workItemId: string,
    requesterId: string
  ): Promise<ActivityEntity[]> {
    const workItem = await this.workItemRepo.findById(workItemId);
    if (!workItem) {
      throw new NotFoundError('Work item not found.', 'WORK_ITEM_NOT_FOUND');
    }

    // Requester must belong to the work item's team
    await this.authzService.requireTeamMember(requesterId, workItem.teamId);

    return this.activityRepo.findByWorkItemId(workItemId);
  }
}

export const activityService = new ActivityService();
