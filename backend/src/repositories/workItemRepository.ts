import { prisma } from '../models/prisma';
import { WorkItemPriority, WorkItemStatus, Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '../utils/errors';

export interface CreateWorkItemData {
  title: string;
  description?: string | null;
  priority?: WorkItemPriority;
  teamId: string;
  createdById: string;
  assigneeId?: string | null;
}

export interface UpdateWorkItemData {
  title?: string;
  description?: string | null;
  priority?: WorkItemPriority;
  status?: WorkItemStatus;
  assigneeId?: string | null;
}

export interface SafeUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface WorkItemEntity {
  id: string;
  title: string;
  description: string | null;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  teamId: string;
  createdById: string;
  assigneeId: string | null;
  version: number;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: SafeUserSummary;
  assignee?: SafeUserSummary | null;
  team?: {
    id: string;
    name: string;
  };
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FindByTeamIdOptions {
  search?: string;
  status?: WorkItemStatus;
  priority?: WorkItemPriority;
  assigneeId?: string;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'status' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export type PaginatedWorkItemsResult = WorkItemEntity[] & {
  data: WorkItemEntity[];
  meta: PaginationMeta;
};

export interface IWorkItemRepository {
  create(data: CreateWorkItemData): Promise<WorkItemEntity>;
  findById(id: string): Promise<WorkItemEntity | null>;
  findByTeamId(
    teamId: string,
    options?: FindByTeamIdOptions
  ): Promise<PaginatedWorkItemsResult>;
  update(id: string, data: UpdateWorkItemData): Promise<WorkItemEntity>;
  updateStatus(id: string, status: WorkItemStatus): Promise<WorkItemEntity>;
  updateWithVersion(
    id: string,
    expectedVersion: number,
    data: UpdateWorkItemData
  ): Promise<WorkItemEntity>;
  updateStatusWithVersion(
    id: string,
    expectedVersion: number,
    status: WorkItemStatus
  ): Promise<WorkItemEntity>;
  delete(id: string): Promise<boolean>;
}

const workItemInclude = {
  createdBy: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  assignee: {
    select: {
      id: true,
      name: true,
      email: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

export class PrismaWorkItemRepository implements IWorkItemRepository {
  async create(data: CreateWorkItemData): Promise<WorkItemEntity> {
    return prisma.workItem.create({
      data: {
        title: data.title,
        description: data.description,
        priority: data.priority ?? WorkItemPriority.MEDIUM,
        teamId: data.teamId,
        createdById: data.createdById,
        assigneeId: data.assigneeId,
        status: WorkItemStatus.OPEN,
      },
      include: workItemInclude,
    });
  }

  async findById(id: string): Promise<WorkItemEntity | null> {
    return prisma.workItem.findUnique({
      where: { id },
      include: workItemInclude,
    });
  }

  async findByTeamId(
    teamId: string,
    options: FindByTeamIdOptions = {}
  ): Promise<PaginatedWorkItemsResult> {
    const where: Prisma.WorkItemWhereInput = {
      teamId,
    };

    if (options.status) {
      where.status = options.status;
    }

    if (options.priority) {
      where.priority = options.priority;
    }

    if (options.assigneeId !== undefined) {
      if (options.assigneeId === 'unassigned' || options.assigneeId === 'null') {
        where.assigneeId = null;
      } else {
        where.assigneeId = options.assigneeId;
      }
    }

    if (options.search && options.search.trim().length > 0) {
      const searchTerm = options.search.trim();
      where.OR = [
        { title: { contains: searchTerm, mode: 'insensitive' } },
        { description: { contains: searchTerm, mode: 'insensitive' } },
      ];
    }

    const page = options.page && options.page > 0 ? options.page : 1;
    const limit =
      options.limit && options.limit > 0 ? Math.min(options.limit, 100) : 20;
    const skip = (page - 1) * limit;

    const sortBy = options.sortBy || 'createdAt';
    const sortOrder = options.sortOrder || 'desc';

    const orderBy: Prisma.WorkItemOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const items = await prisma.workItem.findMany({
      where,
      include: workItemInclude,
      orderBy,
      skip,
      take: limit,
    });

    const total =
      typeof (prisma.workItem as any).count === 'function'
        ? await prisma.workItem.count({ where })
        : items.length;

    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

    const meta: PaginationMeta = {
      page,
      limit,
      total,
      totalPages,
    };

    const result = Object.assign([...items], {
      data: items,
      meta,
    });

    return result as PaginatedWorkItemsResult;
  }

  async update(id: string, data: UpdateWorkItemData): Promise<WorkItemEntity> {
    return prisma.workItem.update({
      where: { id },
      data,
      include: workItemInclude,
    });
  }

  async updateStatus(
    id: string,
    status: WorkItemStatus
  ): Promise<WorkItemEntity> {
    return prisma.workItem.update({
      where: { id },
      data: { status },
      include: workItemInclude,
    });
  }

  async updateWithVersion(
    id: string,
    expectedVersion: number,
    data: UpdateWorkItemData
  ): Promise<WorkItemEntity> {
    const result = await prisma.workItem.updateMany({
      where: {
        id,
        version: expectedVersion,
      },
      data: {
        ...data,
        version: {
          increment: 1,
        },
      },
    });

    if (result.count === 0) {
      const existing = await prisma.workItem.findUnique({
        where: { id },
      });
      if (!existing) {
        throw new NotFoundError('Work item not found.', 'WORK_ITEM_NOT_FOUND');
      }
      throw new ConflictError(
        'The work item has been modified since it was last read.',
        'STALE_WORK_ITEM'
      );
    }

    const updated = await this.findById(id);
    return updated!;
  }

  async updateStatusWithVersion(
    id: string,
    expectedVersion: number,
    status: WorkItemStatus
  ): Promise<WorkItemEntity> {
    return this.updateWithVersion(id, expectedVersion, { status });
  }

  async delete(id: string): Promise<boolean> {
    try {
      await prisma.workItem.delete({
        where: { id },
      });
      return true;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return false;
      }
      throw error;
    }
  }
}

export const workItemRepository: IWorkItemRepository =
  new PrismaWorkItemRepository();
