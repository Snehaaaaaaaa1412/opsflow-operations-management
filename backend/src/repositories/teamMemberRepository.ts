import { prisma } from '../models/prisma';
import { ConflictError } from '../utils/errors';
import { Prisma, TeamRole } from '@prisma/client';

export interface CreateTeamMemberData {
  teamId: string;
  userId: string;
  role?: TeamRole;
}

export interface TeamMemberEntity {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
  createdAt: Date;
  user?: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ITeamMemberRepository {
  create(data: CreateTeamMemberData): Promise<TeamMemberEntity>;
  findByTeamAndUser(teamId: string, userId: string): Promise<TeamMemberEntity | null>;
  findMembersByTeamId(teamId: string): Promise<TeamMemberEntity[]>;
  delete(teamId: string, userId: string): Promise<boolean>;
}

export class PrismaTeamMemberRepository implements ITeamMemberRepository {
  async create(data: CreateTeamMemberData): Promise<TeamMemberEntity> {
    try {
      return await prisma.teamMember.create({
        data: {
          teamId: data.teamId,
          userId: data.userId,
          role: data.role ?? TeamRole.MEMBER,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictError(
          'User is already a member of this team.',
          'MEMBER_ALREADY_EXISTS'
        );
      }
      throw error;
    }
  }

  async findByTeamAndUser(
    teamId: string,
    userId: string
  ): Promise<TeamMemberEntity | null> {
    return prisma.teamMember.findUnique({
      where: {
        userId_teamId: {
          userId,
          teamId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  async findMembersByTeamId(teamId: string): Promise<TeamMemberEntity[]> {
    return prisma.teamMember.findMany({
      where: { teamId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async delete(teamId: string, userId: string): Promise<boolean> {
    try {
      await prisma.teamMember.delete({
        where: {
          userId_teamId: {
            userId,
            teamId,
          },
        },
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

export const teamMemberRepository: ITeamMemberRepository =
  new PrismaTeamMemberRepository();
