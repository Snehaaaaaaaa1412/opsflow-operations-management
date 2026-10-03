import { prisma } from '../models/prisma';
import { ConflictError } from '../utils/errors';
import { Prisma } from '@prisma/client';

export interface CreateTeamData {
  name: string;
  createdById: string;
}

export interface TeamEntity {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITeamRepository {
  findByName(name: string): Promise<TeamEntity | null>;
  findById(id: string): Promise<TeamEntity | null>;
  findAll(): Promise<TeamEntity[]>;
  create(data: CreateTeamData): Promise<TeamEntity>;
}

export class PrismaTeamRepository implements ITeamRepository {
  async findByName(name: string): Promise<TeamEntity | null> {
    return prisma.team.findUnique({
      where: { name },
    });
  }

  async findById(id: string): Promise<TeamEntity | null> {
    return prisma.team.findUnique({
      where: { id },
    });
  }

  async findAll(): Promise<TeamEntity[]> {
    return prisma.team.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: CreateTeamData): Promise<TeamEntity> {
    try {
      return await prisma.team.create({
        data,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          'A team with this name already exists.',
          'TEAM_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }
}

export const teamRepository: ITeamRepository = new PrismaTeamRepository();
