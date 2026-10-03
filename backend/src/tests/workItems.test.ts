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
import {
  WorkItemEntity,
  CreateWorkItemData,
  UpdateWorkItemData,
} from '../repositories/workItemRepository';
import { WorkItemService } from '../services/workItemService';
import { AuthorizationService } from '../services/authorizationService';
import { TeamRole, WorkItemPriority, WorkItemStatus } from '@prisma/client';

// In-memory tables to simulate database state
let teamsTable: TeamEntity[] = [];
let teamMembersTable: TeamMemberEntity[] = [];
let workItemsTable: WorkItemEntity[] = [];
let usersTable: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}[] = [];

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
              user: user
                ? { id: user.id, name: user.name, email: user.email }
                : undefined,
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
                user: user
                  ? { id: user.id, name: user.name, email: user.email }
                  : undefined,
              };
            });
        }),
        create: vi.fn(async ({ data }: { data: CreateTeamMemberData }) => {
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
            user: user
              ? { id: user.id, name: user.name, email: user.email }
              : undefined,
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
            return member;
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
      workItem: {
        create: vi.fn(async ({ data }: { data: CreateWorkItemData }) => {
          const newItem: WorkItemEntity = {
            id: `wi-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            title: data.title,
            description: data.description ?? null,
            status: WorkItemStatus.OPEN,
            priority: data.priority ?? WorkItemPriority.MEDIUM,
            teamId: data.teamId,
            createdById: data.createdById,
            assigneeId: data.assigneeId ?? null,
            version: 1,
            dueAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          workItemsTable.push(newItem);
          const creator = usersTable.find((u) => u.id === newItem.createdById);
          const assignee = newItem.assigneeId
            ? usersTable.find((u) => u.id === newItem.assigneeId)
            : null;
          const team = teamsTable.find((t) => t.id === newItem.teamId);
          return {
            ...newItem,
            createdBy: creator
              ? { id: creator.id, name: creator.name, email: creator.email }
              : undefined,
            assignee: assignee
              ? { id: assignee.id, name: assignee.name, email: assignee.email }
              : null,
            team: team ? { id: team.id, name: team.name } : undefined,
          };
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const item = workItemsTable.find((wi) => wi.id === where.id);
          if (!item) return null;
          const creator = usersTable.find((u) => u.id === item.createdById);
          const assignee = item.assigneeId
            ? usersTable.find((u) => u.id === item.assigneeId)
            : null;
          const team = teamsTable.find((t) => t.id === item.teamId);
          return {
            ...item,
            createdBy: creator
              ? { id: creator.id, name: creator.name, email: creator.email }
              : undefined,
            assignee: assignee
              ? { id: assignee.id, name: assignee.name, email: assignee.email }
              : null,
            team: team ? { id: team.id, name: team.name } : undefined,
          };
        }),
        findMany: vi.fn(
          async ({ where }: { where: { teamId: string } }) => {
            return workItemsTable
              .filter((wi) => wi.teamId === where.teamId)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
              .map((item) => {
                const creator = usersTable.find((u) => u.id === item.createdById);
                const assignee = item.assigneeId
                  ? usersTable.find((u) => u.id === item.assigneeId)
                  : null;
                const team = teamsTable.find((t) => t.id === item.teamId);
                return {
                  ...item,
                  createdBy: creator
                    ? { id: creator.id, name: creator.name, email: creator.email }
                    : undefined,
                  assignee: assignee
                    ? { id: assignee.id, name: assignee.name, email: assignee.email }
                    : null,
                  team: team ? { id: team.id, name: team.name } : undefined,
                };
              });
          }
        ),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string };
            data: UpdateWorkItemData;
          }) => {
            const item = workItemsTable.find((wi) => wi.id === where.id);
            if (!item) {
              const error = new Error('Record not found');
              (error as any).code = 'P2025';
              throw error;
            }
            if (data.title !== undefined) item.title = data.title;
            if (data.description !== undefined) item.description = data.description;
            if (data.priority !== undefined) item.priority = data.priority;
            if (data.assigneeId !== undefined) item.assigneeId = data.assigneeId;
            if (data.status !== undefined) item.status = data.status;
            item.updatedAt = new Date();

            const creator = usersTable.find((u) => u.id === item.createdById);
            const assignee = item.assigneeId
              ? usersTable.find((u) => u.id === item.assigneeId)
              : null;
            const team = teamsTable.find((t) => t.id === item.teamId);
            return {
              ...item,
              createdBy: creator
                ? { id: creator.id, name: creator.name, email: creator.email }
                : undefined,
              assignee: assignee
                ? { id: assignee.id, name: assignee.name, email: assignee.email }
                : null,
              team: team ? { id: team.id, name: team.name } : undefined,
            };
          }
        ),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = workItemsTable.findIndex((wi) => wi.id === where.id);
          if (idx === -1) {
            const error = new Error('Record not found');
            (error as any).code = 'P2025';
            throw error;
          }
          const [deleted] = workItemsTable.splice(idx, 1);
          return deleted;
        }),
      },
    },
  };
});

function createTestToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, { expiresIn: '1h' });
}

describe('Work Items Module (Phase 3)', () => {
  // Test users
  const adminId = 'usr-admin-1';
  const leadId = 'usr-lead-2';
  const memberId = 'usr-member-3';
  const outsideUserId = 'usr-outside-4';

  const adminToken = createTestToken(adminId);
  const leadToken = createTestToken(leadId);
  const memberToken = createTestToken(memberId);
  const outsideUserToken = createTestToken(outsideUserId);

  let teamId: string;
  let otherTeamId: string;

  beforeEach(async () => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [
      { id: adminId, name: 'Alice Admin', email: 'alice@opsflow.io', passwordHash: 'hash-alice' },
      { id: leadId, name: 'Bob Lead', email: 'bob@opsflow.io', passwordHash: 'hash-bob' },
      { id: memberId, name: 'Charlie Member', email: 'charlie@opsflow.io', passwordHash: 'hash-charlie' },
      { id: outsideUserId, name: 'Dave Outside', email: 'dave@opsflow.io', passwordHash: 'hash-dave' },
    ];
    vi.clearAllMocks();

    // 1. Create main Team (Alice is ADMIN)
    const teamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Platform Operations' });
    teamId = teamRes.body.data.id;

    // Add Bob as TEAM_LEAD in main Team
    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: leadId, role: 'TEAM_LEAD' });

    // Add Charlie as MEMBER in main Team
    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'MEMBER' });

    // 2. Create second Team (Dave is ADMIN of other team)
    const otherTeamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${outsideUserToken}`)
      .send({ name: 'Security Engineering' });
    otherTeamId = otherTeamRes.body.data.id;
  });

  // =========================================================================
  // 1. POST /api/teams/:teamId/work-items (Create Work Item)
  // =========================================================================
  describe('POST /api/teams/:teamId/work-items (Create)', () => {
    it('should create a work item with default priority MEDIUM and status OPEN', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Upgrade Kubernetes Cluster',
          description: 'Routine maintenance and patch upgrade',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data');
      const item = res.body.data;
      expect(item.title).toBe('Upgrade Kubernetes Cluster');
      expect(item.description).toBe('Routine maintenance and patch upgrade');
      expect(item.status).toBe('OPEN');
      expect(item.priority).toBe('MEDIUM');
      expect(item.teamId).toBe(teamId);
      expect(item.createdById).toBe(memberId);
      expect(item.assigneeId).toBeNull();
      expect(item.version).toBe(1);
      expect(item.createdBy).toMatchObject({
        id: memberId,
        name: 'Charlie Member',
        email: 'charlie@opsflow.io',
      });
      expect(item.createdBy).not.toHaveProperty('passwordHash');
      expect(workItemsTable).toHaveLength(1);
    });

    it('should create a work item with explicit priority (HIGH) and assignee', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Resolve Production P1 Incident',
          priority: 'HIGH',
          assigneeId: leadId,
        });

      expect(res.status).toBe(201);
      const item = res.body.data;
      expect(item.priority).toBe('HIGH');
      expect(item.assigneeId).toBe(leadId);
      expect(item.assignee).toMatchObject({
        id: leadId,
        name: 'Bob Lead',
        email: 'bob@opsflow.io',
      });
    });

    it('should trim work item title and description', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: '   Trimmed Title   ',
          description: '   Trimmed Description   ',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.title).toBe('Trimmed Title');
      expect(res.body.data.description).toBe('Trimmed Description');
    });

    it('should return 400 when title is missing or empty', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: '   ',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when title exceeds 200 characters', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'T'.repeat(201),
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 when priority is invalid', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Valid Title',
          priority: 'SUPER_URGENT',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 404 when team does not exist', async () => {
      const res = await request(app)
        .post('/api/teams/non-existent-team/work-items')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Valid Title',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
    });

    it('should return 403 when creator is not a member of the team', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${outsideUserToken}`)
        .send({
          title: 'Unauthorized Work Item',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('should return 404 when specified assignee does not exist', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Valid Title',
          assigneeId: 'unknown-user-id',
        });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('USER_NOT_FOUND');
    });

    it('should return 400 INVALID_ASSIGNEE when assignee belongs to a different team (cross-team assignment safety)', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Cross-team assignment attempt',
          assigneeId: outsideUserId, // Dave is in otherTeamId, NOT teamId
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
      expect(res.body.error.message).toBe('Assignee must be a member of the team.');
    });
  });

  // =========================================================================
  // 2. GET /api/work-items/:id (Get by ID)
  // =========================================================================
  describe('GET /api/work-items/:id (Get by ID)', () => {
    let createdItemId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Database Failover Drill',
          description: 'Simulate primary database node failure',
          priority: 'URGENT',
          assigneeId: leadId,
        });
      createdItemId = res.body.data.id;
    });

    it('should retrieve work item by ID for an authorized team member', async () => {
      const res = await request(app)
        .get(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(createdItemId);
      expect(res.body.data.title).toBe('Database Failover Drill');
      expect(res.body.data.priority).toBe('URGENT');
      expect(res.body.data.createdBy).toMatchObject({
        id: adminId,
        name: 'Alice Admin',
      });
      expect(res.body.data.assignee).toMatchObject({
        id: leadId,
        name: 'Bob Lead',
      });
      expect(res.body.data.team).toMatchObject({
        id: teamId,
        name: 'Platform Operations',
      });
    });

    it('should return 404 when work item does not exist', async () => {
      const res = await request(app)
        .get('/api/work-items/non-existent-work-item')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('WORK_ITEM_NOT_FOUND');
    });

    it('should return 403 when requester is not a member of the work item\'s team', async () => {
      const res = await request(app)
        .get(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${outsideUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 3. GET /api/teams/:teamId/work-items (List by Team)
  // =========================================================================
  describe('GET /api/teams/:teamId/work-items (List by Team)', () => {
    beforeEach(async () => {
      // 2 items in main team
      await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task 1' });
      await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Task 2' });

      // 1 item in other team
      await request(app)
        .post(`/api/teams/${otherTeamId}/work-items`)
        .set('Authorization', `Bearer ${outsideUserToken}`)
        .send({ title: 'Security Audit' });
    });

    it('should list only work items belonging to the requested team', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data.every((wi: any) => wi.teamId === teamId)).toBe(true);
    });

    it('should return 404 when team does not exist', async () => {
      const res = await request(app)
        .get('/api/teams/unknown-team-id/work-items')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('TEAM_NOT_FOUND');
    });

    it('should return 403 when requester does not belong to the team', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${outsideUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 4. PATCH /api/work-items/:id (Update)
  // =========================================================================
  describe('PATCH /api/work-items/:id (Update)', () => {
    let createdItemId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Initial Title',
          description: 'Initial Description',
          priority: 'LOW',
          assigneeId: memberId,
        });
      createdItemId = res.body.data.id;
    });

    it('should update title, description, and priority', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          title: 'Updated Title',
          description: 'Updated Description',
          priority: 'HIGH',
        });

      expect(res.status).toBe(200);
      expect(res.body.data.title).toBe('Updated Title');
      expect(res.body.data.description).toBe('Updated Description');
      expect(res.body.data.priority).toBe('HIGH');
    });

    it('should reassign work item to another member of the same team', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({
          assigneeId: leadId,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assigneeId).toBe(leadId);
      expect(res.body.data.assignee.id).toBe(leadId);
    });

    it('should unassign work item by passing null assigneeId', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({
          assigneeId: null,
        });

      expect(res.status).toBe(200);
      expect(res.body.data.assigneeId).toBeNull();
      expect(res.body.data.assignee).toBeNull();
    });

    it('should return 400 when empty body is supplied', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 INVALID_ASSIGNEE when attempting to assign a user from another team', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          assigneeId: outsideUserId,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_ASSIGNEE');
    });

    it('should return 404 when updated work item does not exist', async () => {
      const res = await request(app)
        .patch('/api/work-items/non-existent-id')
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('WORK_ITEM_NOT_FOUND');
    });

    it('should return 403 when requester is not a member of the work item\'s team', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${outsideUserToken}`)
        .send({ title: 'New Title' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 5. DELETE /api/work-items/:id (Delete)
  // =========================================================================
  describe('DELETE /api/work-items/:id (Delete)', () => {
    let createdItemId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post(`/api/teams/${teamId}/work-items`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Item to delete' });
      createdItemId = res.body.data.id;
    });

    it('should allow ADMIN to delete work item', async () => {
      const res = await request(app)
        .delete(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Work item deleted successfully.');
      expect(workItemsTable).toHaveLength(0);
    });

    it('should allow TEAM_LEAD to delete work item', async () => {
      const res = await request(app)
        .delete(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${leadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Work item deleted successfully.');
      expect(workItemsTable).toHaveLength(0);
    });

    it('should reject MEMBER deletion with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .delete(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to delete work items.');
      expect(workItemsTable).toHaveLength(1);
    });

    it('should reject non-team member deletion with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .delete(`/api/work-items/${createdItemId}`)
        .set('Authorization', `Bearer ${outsideUserToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(workItemsTable).toHaveLength(1);
    });

    it('should return 404 when work item does not exist', async () => {
      const res = await request(app)
        .delete('/api/work-items/non-existent-item')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('WORK_ITEM_NOT_FOUND');
    });
  });

  // =========================================================================
  // 6. WorkItemService Isolated Unit Tests
  // =========================================================================
  describe('WorkItemService Isolated Unit Tests', () => {
    it('should create, retrieve, update, and delete through mock repositories', async () => {
      const customStore: WorkItemEntity[] = [];
      const mockWorkItemRepo = {
        create: async (data: CreateWorkItemData) => {
          const item: WorkItemEntity = {
            id: 'wi-mock-1',
            title: data.title,
            description: data.description ?? null,
            status: WorkItemStatus.OPEN,
            priority: data.priority ?? WorkItemPriority.MEDIUM,
            teamId: data.teamId,
            createdById: data.createdById,
            assigneeId: data.assigneeId ?? null,
            version: 1,
            dueAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          customStore.push(item);
          return item;
        },
        findById: async (id: string) => customStore.find((i) => i.id === id) ?? null,
        findByTeamId: async (tId: string) => customStore.filter((i) => i.teamId === tId),
        update: async (id: string, data: UpdateWorkItemData) => {
          const item = customStore.find((i) => i.id === id)!;
          if (data.title) item.title = data.title;
          if (data.status) item.status = data.status;
          return item;
        },
        updateStatus: async (id: string, status: WorkItemStatus) => {
          const item = customStore.find((i) => i.id === id)!;
          item.status = status;
          return item;
        },
        delete: async (id: string) => {
          const idx = customStore.findIndex((i) => i.id === id);
          if (idx >= 0) {
            customStore.splice(idx, 1);
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

      const mockTeamMemberRepo = {
        create: async () => {
          throw new Error('Not implemented');
        },
        findByTeamAndUser: async (tId: string, uId: string) =>
          tId === 'team-mock' && uId === 'user-admin'
            ? {
                id: 'tm-1',
                teamId: tId,
                userId: uId,
                role: TeamRole.ADMIN,
                createdAt: new Date(),
              }
            : null,
        findMembersByTeamId: async () => [],
        updateRole: async () => {
          throw new Error('Not implemented');
        },
        delete: async () => true,
      };

      const mockUserRepo = {
        findById: async (id: string) =>
          id === 'user-admin'
            ? {
                id: 'user-admin',
                name: 'Admin',
                email: 'admin@opsflow.io',
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

      const authz = new AuthorizationService(mockTeamMemberRepo, mockTeamRepo);
      const service = new WorkItemService(
        mockWorkItemRepo,
        mockTeamRepo,
        mockTeamMemberRepo,
        mockUserRepo,
        authz
      );

      // 1. Create
      const created = await service.createWorkItem('team-mock', 'user-admin', {
        title: 'Mock Task',
        priority: 'HIGH',
      });
      expect(created.title).toBe('Mock Task');
      expect(created.priority).toBe('HIGH');
      expect(customStore).toHaveLength(1);

      // 2. Get
      const fetched = await service.getWorkItem('wi-mock-1', 'user-admin');
      expect(fetched.id).toBe('wi-mock-1');

      // 3. List
      const listed = await service.listWorkItems('team-mock', 'user-admin');
      expect(listed).toHaveLength(1);

      // 4. Update
      const updated = await service.updateWorkItem('wi-mock-1', 'user-admin', {
        title: 'Updated Mock Task',
      });
      expect(updated.title).toBe('Updated Mock Task');

      // 5. Delete
      await service.deleteWorkItem('wi-mock-1', 'user-admin');
      expect(customStore).toHaveLength(0);
    });
  });
});
