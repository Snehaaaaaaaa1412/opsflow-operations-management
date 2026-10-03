import { prisma } from '../models/prisma';
import { ConflictError } from '../utils/errors';
import { Prisma } from '@prisma/client';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
}

export interface UserEntity {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUserRepository {
  findByEmail(email: string): Promise<UserEntity | null>;
  findById(id: string): Promise<UserEntity | null>;
  create(data: CreateUserData): Promise<UserEntity>;
}

export class PrismaUserRepository implements IUserRepository {
  async findByEmail(email: string): Promise<UserEntity | null> {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    return prisma.user.findUnique({
      where: { id },
    });
  }

  async create(data: CreateUserData): Promise<UserEntity> {
    try {
      return await prisma.user.create({
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          'An account with this email already exists.',
          'EMAIL_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }
}

export const userRepository: IUserRepository = new PrismaUserRepository();
