import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config';
import { TeamEntity, CreateTeamData } from '../repositories/teamRepository';
import {
  TeamMemberEntity,
  CreateTeamMemberData,
} from '../repositories/teamMemberRepository';
import { TeamService } from '../services/teamService';
import { TeamMemberService } from '../services/teamMemberService';
import { AuthorizationService } from '../services/authorizationService';
import { TeamRole } from '@prisma/client';

// In-memory tables to simulate PostgreSQL behavior
let teamsTable: TeamEntity[] = [];
let teamMembersTable: TeamMemberEntity[] = [];
let usersTable: { id: string; name: string; email: string }[] = [];

vi.mock('../models/prisma', () => {
  return {
    prisma: {
      team: {
        findUnique: vi.fn(
          async ({ where }: { where: { id?: string; name?: string } }) => {
            if (where.name) {
              return teamsTable.find((t) => t.name === where.name) ?? null;
            }
            if (where.id) {
              return teamsTable.find((t) => t.id === where.id) ?? null;
            }
            return null;
          }
        ),
        findMany: vi.fn(
          async ({
            where,
          }: {
            where?: { members?: { some?: { userId: string } } };
          } = {}) => {
            let result = [...teamsTable];
            if (where?.members?.some?.userId) {
              const uId = where.members.some.userId;
              const userTeamIds = teamMembersTable
                .filter((tm) => tm.userId === uId)
                .map((tm) => tm.teamId);
              result = result.filter((t) => userTeamIds.includes(t.id));
            }
            return result.sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
            );
          }
        ),
        create: vi.fn(async ({ data }: { data: CreateTeamData }) => {
          const existing = teamsTable.find((t) => t.name === data.name);
          if (existing) {
            const error = new Error('Unique constraint failed on the constraint: teams_name_key');
            (error as any).code = 'P2002';
            throw error;
          }
          const newTeam: TeamEntity = {
            id: `team-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: data.name,
            createdById: data.createdById,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          teamsTable.push(newTeam);
          return newTeam;
        }),
      },
      teamMember: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              id?: string;
              userId_teamId?: { userId: string; teamId: string };
            };
          }) => {
            let found: TeamMemberEntity | undefined;
            if (where.userId_teamId) {
              found = teamMembersTable.find(
                (tm) =>
                  tm.userId === where.userId_teamId!.userId &&
                  tm.teamId === where.userId_teamId!.teamId
              );
            } else if (where.id) {
              found = teamMembersTable.find((tm) => tm.id === where.id);
            }
            if (!found) return null;
            const user = usersTable.find((u) => u.id === found!.userId);
            return {
              ...found,
              user: user ? { id: user.id, name: user.name, email: user.email } : undefined,
            };
          }
        ),
        findMany: vi.fn(async ({ where }: { where: { teamId: string } }) => {
          return teamMembersTable
            .filter((tm) => tm.teamId === where.teamId)
            .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
            .map((tm) => {
              const user = usersTable.find((u) => u.id === tm.userId);
              return {
                ...tm,
                user: user ? { id: user.id, name: user.name, email: user.email } : undefined,
              };
            });
        }),
        create: vi.fn(async ({ data }: { data: CreateTeamMemberData }) => {
          const existing = teamMembersTable.find(
            (tm) => tm.userId === data.userId && tm.teamId === data.teamId
          );
          if (existing) {
            const error = new Error(
              'Unique constraint failed on the constraint: team_members_user_id_team_id_key'
            );
            (error as any).code = 'P2002';
            throw error;
          }
          const newMember: TeamMemberEntity = {
            id: `tm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            teamId: data.teamId,
            userId: data.userId,
            role: data.role ?? TeamRole.MEMBER,
            createdAt: new Date(),
          };
          teamMembersTable.push(newMember);
          const user = usersTable.find((u) => u.id === data.userId);
          return {
            ...newMember,
            user: user ? { id: user.id, name: user.name, email: user.email } : undefined,
          };
        }),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { userId_teamId: { userId: string; teamId: string } };
            data: { role: TeamRole };
          }) => {
            const member = teamMembersTable.find(
              (tm) =>
                tm.userId === where.userId_teamId.userId &&
                tm.teamId === where.userId_teamId.teamId
            );
            if (!member) {
              const error = new Error('Record not found');
              (error as any).code = 'P2025';
              throw error;
            }
            member.role = data.role;
            const user = usersTable.find((u) => u.id === member.userId);
            return {
              ...member,
              user: user
                ? { id: user.id, name: user.name, email: user.email }
                : undefined,
            };
          }
        ),
        delete: vi.fn(
          async ({
            where,
          }: {
            where: { userId_teamId: { userId: string; teamId: string } };
          }) => {
            const idx = teamMembersTable.findIndex(
              (tm) =>
                tm.userId === where.userId_teamId.userId &&
                tm.teamId === where.userId_teamId.teamId
            );
            if (idx === -1) {
              const error = new Error('Record not found');
              (error as any).code = 'P2025';
              throw error;
            }
            const [deleted] = teamMembersTable.splice(idx, 1);
            return deleted;
          }
        ),
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id?: string } }) => {
          if (where.id) {
            return usersTable.find((u) => u.id === where.id) ?? null;
          }
          return null;
        }),
      },
    },
  };
});

function createTestToken(userId = 'usr-test-123'): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, { expiresIn: '1h' });
}

describe('Teams Module', () => {
  beforeEach(() => {
    teamsTable = [];
    teamMembersTable = [];
    usersTable = [];
    vi.clearAllMocks();
  });

  describe('Authentication Requirement', () => {
    it('should return 401 when creating a team without authorization header', async () => {
      const res = await request(app).post('/api/teams').send({
        name: 'Platform Ops',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Authentication token required.');
    });

    it('should return 401 when token is invalid', async () => {
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          name: 'Platform Ops',
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
      expect(res.body.error.message).toBe('Invalid or expired authentication token.');
    });

    it('should return 401 when listing teams without authorization header', async () => {
      const res = await request(app).get('/api/teams');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('POST /api/teams (Create Team)', () => {
    it('should create a team with authenticated user as createdById and return 201', async () => {
      const token = createTestToken('usr-alice-777');

      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Incident Response',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data.name).toBe('Incident Response');
      expect(res.body.data.createdById).toBe('usr-alice-777');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();

      expect(teamsTable).toHaveLength(1);
      expect(teamsTable[0].name).toBe('Incident Response');
      expect(teamsTable[0].createdById).toBe('usr-alice-777');
    });

    it('should trim team name before creation', async () => {
      const token = createTestToken('usr-bob-111');

      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '   Customer Success   ',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe('Customer Success');
      expect(teamsTable[0].name).toBe('Customer Success');
    });

    it('should return 409 Conflict when team name already exists', async () => {
      const token = createTestToken('usr-alice-777');

      // First creation succeeds
      const firstRes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Site Reliability',
        });
      expect(firstRes.status).toBe(201);

      // Duplicate creation fails
      const duplicateRes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Site Reliability',
        });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body).toHaveProperty('error');
      expect(duplicateRes.body.error).toEqual({
        code: 'TEAM_ALREADY_EXISTS',
        message: 'A team with this name already exists.',
      });

      expect(teamsTable).toHaveLength(1);
    });

    describe('Validation Failures', () => {
      it('should return 400 when team name is missing or empty', async () => {
        const token = createTestToken();

        const res = await request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: '   ',
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
        expect(res.body.error.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              field: 'name',
            }),
          ])
        );
      });

      it('should return 400 when team name exceeds 100 characters', async () => {
        const token = createTestToken();

        const res = await request(app)
          .post('/api/teams')
          .set('Authorization', `Bearer ${token}`)
          .send({
            name: 'A'.repeat(101),
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });
    });
  });

  describe('GET /api/teams (List Teams)', () => {
    it('should return empty list when no teams exist', async () => {
      const token = createTestToken();

      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toEqual([]);
    });

    it('should return all created teams', async () => {
      const token = createTestToken('usr-creator');

      await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Alpha Team' });

      await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Beta Team' });

      const res = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'Alpha Team', createdById: 'usr-creator' }),
          expect.objectContaining({ name: 'Beta Team', createdById: 'usr-creator' }),
        ])
      );
    });
  });

  describe('GET /api/teams/:id (Get Team by ID)', () => {
    it('should return team when id exists', async () => {
      const token = createTestToken('usr-creator');

      const createRes = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Core Infrastructure' });

      const teamId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/teams/${teamId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(teamId);
      expect(res.body.data.name).toBe('Core Infrastructure');
      expect(res.body.data.createdById).toBe('usr-creator');
    });

    it('should return 404 when team id does not exist', async () => {
      const token = createTestToken();

      const res = await request(app)
        .get('/api/teams/non-existent-team-id')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
      expect(res.body.error.message).toBe('Team not found.');
    });
  });

  describe('TeamService Isolated Unit Tests', () => {
    it('should create and retrieve teams through repository abstraction', async () => {
      const customStore: TeamEntity[] = [];
      const customMembers: TeamMemberEntity[] = [];
      const mockRepo = {
        findByName: async (name: string) => customStore.find((t) => t.name === name) ?? null,
        findById: async (id: string) => customStore.find((t) => t.id === id) ?? null,
        findAll: async () => [...customStore],
        findByUserId: async (userId: string) => customStore.filter((t) => t.createdById === userId),
        create: async (data: CreateTeamData) => {
          const team: TeamEntity = {
            id: 'mock-team-1',
            name: data.name,
            createdById: data.createdById,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          customStore.push(team);
          return team;
        },
      };

      const mockMemberRepo = {
        create: async (data: CreateTeamMemberData) => {
          const m: TeamMemberEntity = {
            id: 'mock-tm-1',
            teamId: data.teamId,
            userId: data.userId,
            role: data.role ?? TeamRole.MEMBER,
            createdAt: new Date(),
          };
          customMembers.push(m);
          return m;
        },
        findByTeamAndUser: async (teamId: string, userId: string) =>
          customMembers.find((m) => m.teamId === teamId && m.userId === userId) ?? null,
        findMembersByTeamId: async (teamId: string) =>
          customMembers.filter((m) => m.teamId === teamId),
        updateRole: async (teamId: string, userId: string, role: TeamRole) => {
          const m = customMembers.find((item) => item.teamId === teamId && item.userId === userId)!;
          m.role = role;
          return m;
        },
        delete: async (teamId: string, userId: string) => true,
      };

      const authz = new AuthorizationService(mockMemberRepo, mockRepo);
      const service = new TeamService(mockRepo, mockMemberRepo, authz);
      const team = await service.createTeam('DevOps', 'usr-test-owner');

      expect(team.name).toBe('DevOps');
      expect(team.createdById).toBe('usr-test-owner');
      expect(customMembers).toHaveLength(1);
      expect(customMembers[0].role).toBe(TeamRole.ADMIN);

      const all = await service.listTeams('usr-test-owner');
      expect(all).toHaveLength(1);

      const retrieved = await service.getTeamById('mock-team-1', 'usr-test-owner');
      expect(retrieved.name).toBe('DevOps');
    });
  });

  describe('Team Membership Management (Phase 2B)', () => {
    let testTeamId: string;
    const adminToken = createTestToken('usr-admin-1');

    beforeEach(async () => {
      // Seed a user in usersTable
      usersTable.push(
        { id: 'usr-admin-1', name: 'Admin Alice', email: 'alice@opsflow.io' },
        { id: 'usr-member-2', name: 'Member Bob', email: 'bob@opsflow.io' },
        { id: 'usr-lead-3', name: 'Lead Charlie', email: 'charlie@opsflow.io' }
      );

      // Create a test team
      const res = await request(app)
        .post('/api/teams')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Infrastructure Engineering' });

      testTeamId = res.body.data.id;
    });

    describe('POST /api/teams/:id/members (Add Member)', () => {
      it('should add a member with default role MEMBER and return 201', async () => {
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: 'usr-member-2',
          });

        expect(res.status).toBe(201);
        expect(res.body).toHaveProperty('data');
        expect(res.body.data.teamId).toBe(testTeamId);
        expect(res.body.data.userId).toBe('usr-member-2');
        expect(res.body.data.role).toBe('MEMBER');
        expect(res.body.data.user).toMatchObject({
          id: 'usr-member-2',
          name: 'Member Bob',
          email: 'bob@opsflow.io',
        });

        expect(teamMembersTable).toHaveLength(2);
      });

      it('should add a member with explicit role (ADMIN or TEAM_LEAD)', async () => {
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: 'usr-lead-3',
            role: 'TEAM_LEAD',
          });

        expect(res.status).toBe(201);
        expect(res.body.data.role).toBe('TEAM_LEAD');
        expect(
          teamMembersTable.find((m) => m.userId === 'usr-lead-3')?.role
        ).toBe('TEAM_LEAD');
      });

      it('should return 404 when team does not exist', async () => {
        const res = await request(app)
          .post('/api/teams/non-existent-team/members')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: 'usr-member-2',
          });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
        expect(res.body.error.message).toBe('Team not found.');
      });

      it('should return 404 when user does not exist', async () => {
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: 'non-existent-user-id',
          });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('USER_NOT_FOUND');
        expect(res.body.error.message).toBe('User not found.');
      });

      it('should return 409 Conflict when user is already a member of the team', async () => {
        // First add succeeds
        await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: 'usr-member-2' });

        // Duplicate add fails
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: 'usr-member-2' });

        expect(res.status).toBe(409);
        expect(res.body.error.code).toBe('MEMBER_ALREADY_EXISTS');
        expect(res.body.error.message).toBe('User is already a member of this team.');
        expect(teamMembersTable).toHaveLength(2);
      });

      it('should return 400 when role is invalid', async () => {
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            userId: 'usr-member-2',
            role: 'SUPERADMIN',
          });

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should return 400 when userId is missing', async () => {
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({});

        expect(res.status).toBe(400);
        expect(res.body.error.code).toBe('VALIDATION_ERROR');
      });

      it('should return 401 when unauthenticated', async () => {
        const res = await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .send({ userId: 'usr-member-2' });

        expect(res.status).toBe(401);
        expect(res.body.error.code).toBe('UNAUTHORIZED');
      });
    });

    describe('GET /api/teams/:id/members (List Members)', () => {
      it('should list all members of the team', async () => {
        await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: 'usr-member-2', role: 'MEMBER' });

        await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: 'usr-lead-3', role: 'TEAM_LEAD' });

        const res = await request(app)
          .get(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('data');
        expect(res.body.data).toHaveLength(3);
        expect(res.body.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ userId: 'usr-admin-1', role: 'ADMIN' }),
            expect.objectContaining({ userId: 'usr-member-2', role: 'MEMBER' }),
            expect.objectContaining({ userId: 'usr-lead-3', role: 'TEAM_LEAD' }),
          ])
        );
      });

      it('should return 404 when team does not exist', async () => {
        const res = await request(app)
          .get('/api/teams/unknown-team/members')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
      });
    });

    describe('DELETE /api/teams/:id/members/:userId (Remove Member)', () => {
      it('should remove member from team and return 200', async () => {
        await request(app)
          .post(`/api/teams/${testTeamId}/members`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ userId: 'usr-member-2' });

        expect(teamMembersTable).toHaveLength(2);

        const res = await request(app)
          .delete(`/api/teams/${testTeamId}/members/usr-member-2`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.data.message).toBe('Member removed successfully.');
        expect(teamMembersTable).toHaveLength(1);
      });

      it('should return 404 when team does not exist', async () => {
        const res = await request(app)
          .delete('/api/teams/unknown-team/members/usr-member-2')
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
      });

      it('should return 404 when member is not in team', async () => {
        const res = await request(app)
          .delete(`/api/teams/${testTeamId}/members/usr-member-2`)
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
        expect(res.body.error.message).toBe('Team member not found.');
      });
    });

    describe('TeamMemberService Isolated Unit Tests', () => {
      it('should add, list, update, and remove members through mocked repositories', async () => {
        const customMembers: TeamMemberEntity[] = [
          {
            id: 'tm-actor',
            teamId: 'team-mock',
            userId: 'actor-admin',
            role: TeamRole.ADMIN,
            createdAt: new Date(),
          },
        ];
        const mockMemberRepo = {
          create: async (data: CreateTeamMemberData) => {
            const m: TeamMemberEntity = {
              id: 'tm-unit-1',
              teamId: data.teamId,
              userId: data.userId,
              role: data.role ?? TeamRole.MEMBER,
              createdAt: new Date(),
            };
            customMembers.push(m);
            return m;
          },
          findByTeamAndUser: async (tId: string, uId: string) =>
            customMembers.find((m) => m.teamId === tId && m.userId === uId) ?? null,
          findMembersByTeamId: async (tId: string) =>
            customMembers.filter((m) => m.teamId === tId),
          updateRole: async (tId: string, uId: string, role: TeamRole) => {
            const m = customMembers.find(
              (item) => item.teamId === tId && item.userId === uId
            );
            if (!m) throw new Error('Not found');
            m.role = role;
            return m;
          },
          delete: async (tId: string, uId: string) => {
            const idx = customMembers.findIndex(
              (m) => m.teamId === tId && m.userId === uId
            );
            if (idx >= 0) {
              customMembers.splice(idx, 1);
              return true;
            }
            return false;
          },
        };

        const mockTeamRepo = {
          findById: async (id: string) =>
            id === 'team-mock'
              ? {
                  id: 'team-mock',
                  name: 'Mock Team',
                  createdById: 'owner-1',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }
              : null,
          findByName: async () => null,
          findAll: async () => [],
          findByUserId: async () => [],
          create: async () => {
            throw new Error('Not implemented');
          },
        };

        const mockUserRepo = {
          findById: async (id: string) =>
            id === 'user-mock'
              ? {
                  id: 'user-mock',
                  name: 'Mock User',
                  email: 'mock@opsflow.io',
                  passwordHash: 'hash',
                  createdAt: new Date(),
                  updatedAt: new Date(),
                }
              : null,
          findByEmail: async () => null,
          create: async () => {
            throw new Error('Not implemented');
          },
        };

        const authzService = new AuthorizationService(
          mockMemberRepo,
          mockTeamRepo
        );
        const service = new TeamMemberService(
          mockMemberRepo,
          mockTeamRepo,
          mockUserRepo,
          authzService
        );

        // Add
        const added = await service.addMember(
          'team-mock',
          'user-mock',
          TeamRole.MEMBER,
          'actor-admin'
        );
        expect(added.role).toBe(TeamRole.MEMBER);

        // Update role
        const updated = await service.updateMemberRole(
          'team-mock',
          'user-mock',
          TeamRole.TEAM_LEAD,
          'actor-admin'
        );
        expect(updated.role).toBe(TeamRole.TEAM_LEAD);

        // List
        const members = await service.listMembers('team-mock', 'actor-admin');
        expect(members).toHaveLength(2); // actor-admin + user-mock

        // Remove
        await service.removeMember('team-mock', 'user-mock', 'actor-admin');
        const afterRemove = await service.listMembers(
          'team-mock',
          'actor-admin'
        );
        expect(afterRemove).toHaveLength(1);
      });
    });
  });
});
