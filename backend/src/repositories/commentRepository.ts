import { prisma } from '../models/prisma';

export interface SafeUserSummary {
  id: string;
  name: string;
  email: string;
}

export interface CommentEntity {
  id: string;
  workItemId: string;
  authorId: string;
  body: string;
  content?: string;
  createdAt: Date;
  updatedAt: Date;
  author?: SafeUserSummary;
}

export interface CreateCommentData {
  workItemId: string;
  authorId: string;
  body: string;
}

export interface ICommentRepository {
  create(data: CreateCommentData): Promise<CommentEntity>;
  findById(id: string): Promise<CommentEntity | null>;
  findByWorkItemId(workItemId: string): Promise<CommentEntity[]>;
  delete(id: string): Promise<void>;
}

export class PrismaCommentRepository implements ICommentRepository {
  async create(data: CreateCommentData): Promise<CommentEntity> {
    if (!prisma.comment) {
      return {
        id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        workItemId: data.workItemId,
        authorId: data.authorId,
        body: data.body,
        content: data.body,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }

    const comment = await prisma.comment.create({
      data: {
        workItemId: data.workItemId,
        authorId: data.authorId,
        body: data.body,
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return {
      id: comment.id,
      workItemId: comment.workItemId,
      authorId: comment.authorId,
      body: comment.body,
      content: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: comment.author
        ? {
            id: comment.author.id,
            name: comment.author.name,
            email: comment.author.email,
          }
        : undefined,
    };
  }

  async findById(id: string): Promise<CommentEntity | null> {
    if (!prisma.comment) return null;

    const comment = await prisma.comment.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!comment) return null;

    return {
      id: comment.id,
      workItemId: comment.workItemId,
      authorId: comment.authorId,
      body: comment.body,
      content: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: comment.author
        ? {
            id: comment.author.id,
            name: comment.author.name,
            email: comment.author.email,
          }
        : undefined,
    };
  }

  async findByWorkItemId(workItemId: string): Promise<CommentEntity[]> {
    if (!prisma.comment) return [];

    const comments = await prisma.comment.findMany({
      where: { workItemId },
      orderBy: { createdAt: 'asc' },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return comments.map((comment) => ({
      id: comment.id,
      workItemId: comment.workItemId,
      authorId: comment.authorId,
      body: comment.body,
      content: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      author: comment.author
        ? {
            id: comment.author.id,
            name: comment.author.name,
            email: comment.author.email,
          }
        : undefined,
    }));
  }

  async delete(id: string): Promise<void> {
    if (!prisma.comment) return;

    await prisma.comment.delete({
      where: { id },
    });
  }
}

export const commentRepository = new PrismaCommentRepository();
