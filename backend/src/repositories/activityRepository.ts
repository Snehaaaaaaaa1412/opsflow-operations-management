import { prisma } from '../models/prisma';
import { Prisma } from '@prisma/client';

export interface SafeUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface ActivityEntity {
  id: string;
  workItemId: string;
  actorId: string;
  action: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  actor?: SafeUserSummary;
}

export interface CreateActivityData {
  workItemId: string;
  actorId: string;
  action: string;
  metadata?: Record<string, unknown> | null;
}

export interface IActivityRepository {
  create(data: CreateActivityData): Promise<ActivityEntity>;
  findByWorkItemId(workItemId: string): Promise<ActivityEntity[]>;
}

export class PrismaActivityRepository implements IActivityRepository {
  async create(data: CreateActivityData): Promise<ActivityEntity> {
    if (!prisma.activity) {
      return {
        id: `activity-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        workItemId: data.workItemId,
        actorId: data.actorId,
        action: data.action,
        metadata: data.metadata ?? null,
        createdAt: new Date(),
      };
    }

    const activity = await prisma.activity.create({
      data: {
        workItemId: data.workItemId,
        actorId: data.actorId,
        action: data.action,
        metadata: (data.metadata ?? Prisma.JsonNull) as any,
      },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      id: activity.id,
      workItemId: activity.workItemId,
      actorId: activity.actorId,
      action: activity.action,
      metadata: activity.metadata as Record<string, unknown> | null,
      createdAt: activity.createdAt,
      actor: activity.actor
        ? {
            id: activity.actor.id,
            name: activity.actor.name,
            email: activity.actor.email,
          }
        : undefined,
    };
  }

  async findByWorkItemId(workItemId: string): Promise<ActivityEntity[]> {
    if (!prisma.activity) return [];

    const activities = await prisma.activity.findMany({
      where: { workItemId },
      orderBy: { createdAt: 'asc' },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return activities.map((activity) => ({
      id: activity.id,
      workItemId: activity.workItemId,
      actorId: activity.actorId,
      action: activity.action,
      metadata: activity.metadata as Record<string, unknown> | null,
      createdAt: activity.createdAt,
      actor: activity.actor
        ? {
            id: activity.actor.id,
            name: activity.actor.name,
            email: activity.actor.email,
          }
        : undefined,
    }));
  }
}

export const activityRepository = new PrismaActivityRepository();
