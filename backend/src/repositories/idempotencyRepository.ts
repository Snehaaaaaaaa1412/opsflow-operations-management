import { prisma } from '../models/prisma';
import { Prisma } from '@prisma/client';

export interface IdempotencyRecordEntity {
  id: string;
  key: string;
  userId: string;
  operation: string;
  responseStatus: number;
  responseBody: unknown | null;
  createdAt: Date;
}

export interface CreateIdempotencyRecordData {
  key: string;
  userId: string;
  operation: string;
  responseStatus: number;
  responseBody?: unknown | null;
}

export interface UpdateIdempotencyRecordData {
  responseStatus: number;
  responseBody?: unknown | null;
}

export interface IIdempotencyRepository {
  findByKeyAndUserId(
    key: string,
    userId: string
  ): Promise<IdempotencyRecordEntity | null>;
  create(data: CreateIdempotencyRecordData): Promise<IdempotencyRecordEntity>;
  update(
    key: string,
    userId: string,
    data: UpdateIdempotencyRecordData
  ): Promise<IdempotencyRecordEntity>;
  delete(key: string, userId: string): Promise<void>;
}

export class PrismaIdempotencyRepository implements IIdempotencyRepository {
  async findByKeyAndUserId(
    key: string,
    userId: string
  ): Promise<IdempotencyRecordEntity | null> {
    const record = await prisma.idempotencyRecord.findUnique({
      where: {
        key_userId: {
          key,
          userId,
        },
      },
    });

    if (!record) return null;

    return {
      id: record.id,
      key: record.key,
      userId: record.userId,
      operation: record.operation,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
      createdAt: record.createdAt,
    };
  }

  async create(
    data: CreateIdempotencyRecordData
  ): Promise<IdempotencyRecordEntity> {
    const record = await prisma.idempotencyRecord.create({
      data: {
        key: data.key,
        userId: data.userId,
        operation: data.operation,
        responseStatus: data.responseStatus,
        responseBody: (data.responseBody ?? Prisma.JsonNull) as any,
      },
    });

    return {
      id: record.id,
      key: record.key,
      userId: record.userId,
      operation: record.operation,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
      createdAt: record.createdAt,
    };
  }

  async update(
    key: string,
    userId: string,
    data: UpdateIdempotencyRecordData
  ): Promise<IdempotencyRecordEntity> {
    const record = await prisma.idempotencyRecord.update({
      where: {
        key_userId: {
          key,
          userId,
        },
      },
      data: {
        responseStatus: data.responseStatus,
        responseBody: (data.responseBody ?? Prisma.JsonNull) as any,
      },
    });

    return {
      id: record.id,
      key: record.key,
      userId: record.userId,
      operation: record.operation,
      responseStatus: record.responseStatus,
      responseBody: record.responseBody,
      createdAt: record.createdAt,
    };
  }

  async delete(key: string, userId: string): Promise<void> {
    try {
      await prisma.idempotencyRecord.delete({
        where: {
          key_userId: {
            key,
            userId,
          },
        },
      });
    } catch {
      // Ignore if record already deleted or not found
    }
  }
}

export const idempotencyRepository = new PrismaIdempotencyRepository();
