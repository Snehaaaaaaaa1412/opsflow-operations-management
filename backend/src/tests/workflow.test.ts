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
import {
  WorkItemService,
  ALLOWED_STATUS_TRANSITIONS,
} from '../services/workItemService';
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
        findMany: vi.fn(async ({ where }: { where: { teamId: string } }) => {
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
        }),
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
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version?: number };
            data: any;
          }) => {
            const item = workItemsTable.find((wi) => wi.id === where.id);
            if (!item) return { count: 0 };
            if (where.version !== undefined && item.version !== where.version) {
              return { count: 0 };
            }
            if (data.title !== undefined) item.title = data.title;
            if (data.description !== undefined) item.description = data.description;
            if (data.priority !== undefined) item.priority = data.priority;
            if (data.assigneeId !== undefined) item.assigneeId = data.assigneeId;
            if (data.status !== undefined) item.status = data.status;
            if (data.version?.increment) {
              item.version += data.version.increment;
            } else if (typeof data.version === 'number') {
              item.version = data.version;
            }
            item.updatedAt = new Date();
            return { count: 1 };
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

describe('Workflow & Status Transitions Module (Phase 5)', () => {
  // Test users
  const adminId = 'usr-admin-wf-1';
  const leadId = 'usr-lead-wf-2';
  const memberId = 'usr-member-wf-3';
  const outsideUserId = 'usr-outside-wf-4';

  const adminToken = createTestToken(adminId);
  const leadToken = createTestToken(leadId);
  const memberToken = createTestToken(memberId);
  const outsideUserToken = createTestToken(outsideUserId);

  let teamId: string;

  beforeEach(async () => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [
      { id: adminId, name: 'Alice Admin', email: 'alice-wf@opsflow.io', passwordHash: 'hash-alice' },
      { id: leadId, name: 'Bob Lead', email: 'bob-wf@opsflow.io', passwordHash: 'hash-bob' },
      { id: memberId, name: 'Charlie Member', email: 'charlie-wf@opsflow.io', passwordHash: 'hash-charlie' },
      { id: outsideUserId, name: 'Dave Outside', email: 'dave-wf@opsflow.io', passwordHash: 'hash-dave' },
    ];
    vi.clearAllMocks();

    // 1. Create main Team (Alice is ADMIN)
    const teamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Workflow Test Team' });
    teamId = teamRes.body.data.id;

    // 2. Add Bob as TEAM_LEAD
    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: leadId, role: TeamRole.TEAM_LEAD });

    // 3. Add Charlie as MEMBER
    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: TeamRole.MEMBER });
  });

  async function createWorkItem(token = adminToken, title = 'Workflow Item') {
    const res = await request(app)
      .post(`/api/teams/${teamId}/work-items`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title,
        priority: 'MEDIUM',
      });
    return res.body.data as WorkItemEntity;
  }

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated transition request with 401 UNAUTHORIZED', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 404 WORK_ITEM_NOT_FOUND when target item does not exist', async () => {
      const res = await request(app)
        .post('/api/work-items/non-existent-id/transition')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('WORK_ITEM_NOT_FOUND');
    });

    it('should reject non-team member with 403 FORBIDDEN', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${outsideUserToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  describe('Validation & Payload Safety', () => {
    it('should return 400 VALIDATION_ERROR when status is omitted', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ version: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when status is an unrecognized string', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'ARCHIVED', version: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 VALIDATION_ERROR when version is omitted', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('State Machine Invariants', () => {
    it('should reject transition to the exact same status with 400 INVALID_STATUS_TRANSITION', async () => {
      const item = await createWorkItem();
      expect(item.status).toBe('OPEN');

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OPEN', version: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(res.body.error.message).toContain('already in status');
    });

    it('should reject disallowed direct jump OPEN -> RESOLVED', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED', version: 1 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
      expect(res.body.error.message).toContain('Invalid status transition');
    });

    it('should reject disallowed jump BLOCKED -> RESOLVED', async () => {
      const item = await createWorkItem();

      // OPEN -> BLOCKED (version 1 -> 2)
      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'BLOCKED', version: 1 });

      // BLOCKED -> RESOLVED (disallowed, version 2)
      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED', version: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject disallowed jump CLOSED -> IN_PROGRESS', async () => {
      const item = await createWorkItem();

      // OPEN -> CLOSED (version 1 -> 2)
      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED', version: 1 });

      // CLOSED -> IN_PROGRESS (disallowed, must be reopened to OPEN first, version 2)
      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('should reject disallowed jump CLOSED -> RESOLVED', async () => {
      const item = await createWorkItem();

      // OPEN -> CLOSED (version 1 -> 2)
      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED', version: 1 });

      // CLOSED -> RESOLVED
      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED', version: 2 });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
    });
  });

  describe('Valid Lifecycle Transitions', () => {
    it('should progress through standard delivery cycle: OPEN -> IN_PROGRESS -> RESOLVED -> CLOSED', async () => {
      const item = await createWorkItem();

      // 1. OPEN -> IN_PROGRESS (version 1 -> 2)
      const step1 = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });
      expect(step1.status).toBe(200);
      expect(step1.body.data.status).toBe('IN_PROGRESS');
      expect(step1.body.data.version).toBe(2);

      // 2. IN_PROGRESS -> RESOLVED (version 2 -> 3)
      const step2 = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED', version: 2 });
      expect(step2.status).toBe(200);
      expect(step2.body.data.status).toBe('RESOLVED');
      expect(step2.body.data.version).toBe(3);

      // 3. RESOLVED -> CLOSED (version 3 -> 4)
      const step3 = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED', version: 3 });
      expect(step3.status).toBe(200);
      expect(step3.body.data.status).toBe('CLOSED');
      expect(step3.body.data.version).toBe(4);
    });

    it('should handle blocker cycle: IN_PROGRESS -> BLOCKED -> IN_PROGRESS', async () => {
      const item = await createWorkItem();

      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      // Mark blocked (version 2 -> 3)
      const blockedRes = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'BLOCKED', version: 2 });
      expect(blockedRes.status).toBe(200);
      expect(blockedRes.body.data.status).toBe('BLOCKED');
      expect(blockedRes.body.data.version).toBe(3);

      // Unblock and resume (version 3 -> 4)
      const resumedRes = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 3 });
      expect(resumedRes.status).toBe(200);
      expect(resumedRes.body.data.status).toBe('IN_PROGRESS');
      expect(resumedRes.body.data.version).toBe(4);
    });

    it('should allow reopening closed work items (CLOSED -> OPEN)', async () => {
      const item = await createWorkItem();

      // OPEN -> CLOSED (version 1 -> 2)
      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED', version: 1 });

      // CLOSED -> OPEN (version 2 -> 3)
      const reopened = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OPEN', version: 2 });

      expect(reopened.status).toBe(200);
      expect(reopened.body.data.status).toBe('OPEN');
      expect(reopened.body.data.version).toBe(3);
    });

    it('should allow rejecting resolution (RESOLVED -> IN_PROGRESS)', async () => {
      const item = await createWorkItem();

      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'RESOLVED', version: 2 });

      // Verification fails -> move back to IN_PROGRESS (version 3 -> 4)
      const rejected = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 3 });

      expect(rejected.status).toBe(200);
      expect(rejected.body.data.status).toBe('IN_PROGRESS');
      expect(rejected.body.data.version).toBe(4);
    });

    it('should allow returning active work to backlog (IN_PROGRESS -> OPEN)', async () => {
      const item = await createWorkItem();

      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      const backToQueue = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OPEN', version: 2 });

      expect(backToQueue.status).toBe(200);
      expect(backToQueue.body.data.status).toBe('OPEN');
      expect(backToQueue.body.data.version).toBe(3);
    });

    it('should allow immediate blocking of open work (OPEN -> BLOCKED) and return to OPEN (BLOCKED -> OPEN)', async () => {
      const item = await createWorkItem();

      const blocked = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'BLOCKED', version: 1 });
      expect(blocked.status).toBe(200);
      expect(blocked.body.data.status).toBe('BLOCKED');
      expect(blocked.body.data.version).toBe(2);

      const unblocked = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'OPEN', version: 2 });
      expect(unblocked.status).toBe(200);
      expect(unblocked.body.data.status).toBe('OPEN');
      expect(unblocked.body.data.version).toBe(3);
    });

    it('should allow abandoning blocked item directly (BLOCKED -> CLOSED)', async () => {
      const item = await createWorkItem();

      await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'BLOCKED', version: 1 });

      const closed = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'CLOSED', version: 2 });

      expect(closed.status).toBe(200);
      expect(closed.body.data.status).toBe('CLOSED');
      expect(closed.body.data.version).toBe(3);
    });
  });

  describe('Endpoint Interoperability: PATCH /api/work-items/:id/status', () => {
    it('should perform identical status transition using PATCH /api/work-items/:id/status', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .patch(`/api/work-items/${item.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.version).toBe(2);
    });
  });

  describe('Team Role Permissions', () => {
    it('should allow TEAM_LEAD to perform valid status transition', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.version).toBe(2);
    });

    it('should allow MEMBER to perform valid status transition', async () => {
      const item = await createWorkItem();

      const res = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.version).toBe(2);
    });
  });

  describe('WorkItemService Isolated Unit Tests for Workflow Transitions', () => {
    it('should transition status and reject invalid jumps using mock repository', async () => {
      const customStore: WorkItemEntity[] = [
        {
          id: 'wi-unit-1',
          title: 'Unit Test Task',
          description: null,
          status: WorkItemStatus.OPEN,
          priority: WorkItemPriority.MEDIUM,
          teamId: 'team-mock',
          createdById: adminId,
          assigneeId: null,
          version: 1,
          dueAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const mockRepo = {
        create: async () => customStore[0]!,
        findById: async (id: string) => customStore.find((i) => i.id === id) ?? null,
        findByTeamId: async (tId: string) => customStore.filter((i) => i.teamId === tId),
        update: async () => customStore[0]!,
        updateStatus: async (id: string, status: WorkItemStatus) => {
          const item = customStore.find((i) => i.id === id)!;
          item.status = status;
          return item;
        },
        updateWithVersion: async (
          id: string,
          expectedVersion: number,
          data: UpdateWorkItemData
        ) => {
          const item = customStore.find((i) => i.id === id)!;
          if (item.version !== expectedVersion) {
            throw new Error('Stale update');
          }
          if (data.title) item.title = data.title;
          if (data.status) item.status = data.status;
          item.version += 1;
          return item;
        },
        updateStatusWithVersion: async (
          id: string,
          expectedVersion: number,
          status: WorkItemStatus
        ) => {
          const item = customStore.find((i) => i.id === id)!;
          if (item.version !== expectedVersion) {
            throw new Error('Stale update');
          }
          item.status = status;
          item.version += 1;
          return item;
        },
        delete: async () => true,
      };

      const mockTeamRepo = {
        findById: async (id: string) =>
          id === 'team-mock'
            ? {
                id: 'team-mock',
                name: 'Mock Team',
                createdById: adminId,
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
          tId === 'team-mock' && uId === adminId
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
          id === adminId
            ? {
                id: adminId,
                name: 'Alice',
                email: 'alice@opsflow.io',
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
        mockRepo,
        mockTeamRepo,
        mockTeamMemberRepo,
        mockUserRepo,
        authz
      );

      // 1. Transition OPEN -> IN_PROGRESS
      const result = await service.transitionWorkItemStatus(
        'wi-unit-1',
        adminId,
        WorkItemStatus.IN_PROGRESS,
        1
      );
      expect(result.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(result.version).toBe(2);

      // 2. Reject transition to current status
      await expect(
        service.transitionWorkItemStatus(
          'wi-unit-1',
          adminId,
          WorkItemStatus.IN_PROGRESS,
          2
        )
      ).rejects.toThrow('already in status');

      // 3. Reject invalid jump IN_PROGRESS -> CLOSED
      await expect(
        service.transitionWorkItemStatus(
          'wi-unit-1',
          adminId,
          WorkItemStatus.CLOSED,
          2
        )
      ).rejects.toThrow('Invalid status transition');
    });
  });
});
