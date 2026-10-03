import { prisma } from '../models/prisma';
import { WorkItemPriority, WorkItemStatus, Prisma } from '@prisma/client';

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

export interface IWorkItemRepository {
  create(data: CreateWorkItemData): Promise<WorkItemEntity>;
  findById(id: string): Promise<WorkItemEntity | null>;
  findByTeamId(teamId: string): Promise<WorkItemEntity[]>;
  update(id: string, data: UpdateWorkItemData): Promise<WorkItemEntity>;
  updateStatus(id: string, status: WorkItemStatus): Promise<WorkItemEntity>;
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

  async findByTeamId(teamId: string): Promise<WorkItemEntity[]> {
    return prisma.workItem.findMany({
      where: { teamId },
      include: workItemInclude,
      orderBy: { createdAt: 'desc' },
    });
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
