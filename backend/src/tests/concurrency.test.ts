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

describe('Phase 6 — Optimistic Concurrency & Stale Update Protection', () => {
  const adminId = 'usr-admin-occ-1';
  const memberId = 'usr-member-occ-2';
  const outsideUserId = 'usr-outside-occ-3';

  const adminToken = createTestToken(adminId);
  const memberToken = createTestToken(memberId);
  const outsideUserToken = createTestToken(outsideUserId);

  let teamId: string;

  beforeEach(async () => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [
      { id: adminId, name: 'Alice Admin', email: 'alice-occ@opsflow.io', passwordHash: 'hash-alice' },
      { id: memberId, name: 'Bob Member', email: 'bob-occ@opsflow.io', passwordHash: 'hash-bob' },
      { id: outsideUserId, name: 'Charlie Outside', email: 'charlie-occ@opsflow.io', passwordHash: 'hash-charlie' },
    ];
    vi.clearAllMocks();

    // 1. Create team
    const teamRes = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'OCC Engineering Team' });
    teamId = teamRes.body.data.id;

    // 2. Add member
    await request(app)
      .post(`/api/teams/${teamId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: TeamRole.MEMBER });
  });

  async function createWorkItem(title = 'Concurrency Test Item') {
    const res = await request(app)
      .post(`/api/teams/${teamId}/work-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title,
        description: 'Original Description',
        priority: 'MEDIUM',
      });
    return res.body.data as WorkItemEntity;
  }

  // 1 & 2. Update with correct version succeeds and increments version
  it('1 & 2. Update with correct version succeeds and increments version to 2', async () => {
    const item = await createWorkItem('Initial Item');
    expect(item.version).toBe(1);

    const updateRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Updated Title',
        version: 1,
      });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.title).toBe('Updated Title');
    expect(updateRes.body.data.version).toBe(2);

    // Verify GET returns incremented version
    const getRes = await request(app)
      .get(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.version).toBe(2);
  });

  // 3. Update with stale version returns 409
  it('3. Update with stale version returns HTTP 409 STALE_WORK_ITEM', async () => {
    const item = await createWorkItem('Stale Update Item');

    // First update bumps version to 2
    await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'First Update',
        version: 1,
      });

    // Stale update sends version 1 (which is now outdated)
    const staleRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Stale Update Attempt',
        version: 1,
      });

    expect(staleRes.status).toBe(409);
    expect(staleRes.body.error).toEqual({
      code: 'STALE_WORK_ITEM',
      message: 'The work item has been modified since it was last read.',
    });
  });

  // 4. Stale update does not modify the item
  it('4. Stale update does not modify the item data or increment version further', async () => {
    const item = await createWorkItem('Preserved Item');

    // First update: version 1 -> 2
    await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Valid Update Title',
        version: 1,
      });

    // Attempt stale update with version 1
    const staleRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Malicious / Stale Title Overwrite',
        version: 1,
      });
    expect(staleRes.status).toBe(409);

    // Check item remained unchanged
    const getRes = await request(app)
      .get(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.body.data.title).toBe('Valid Update Title');
    expect(getRes.body.data.version).toBe(2);
  });

  // 5. Two sequential updates using same version → exactly one succeeds
  it('5. Two sequential updates using the same version → exactly one succeeds and second gets 409', async () => {
    const item = await createWorkItem('Concurrent Race Item');
    expect(item.version).toBe(1);

    // Client A sends update with version 1
    const resA = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Update from Client A',
        version: 1,
      });

    // Client B sends update with same version 1 (stale read)
    const resB = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${memberToken}`)
      .send({
        title: 'Update from Client B',
        version: 1,
      });

    expect(resA.status).toBe(200);
    expect(resA.body.data.version).toBe(2);

    expect(resB.status).toBe(409);
    expect(resB.body.error.code).toBe('STALE_WORK_ITEM');

    // Winner's title is persisted
    const finalItem = await request(app)
      .get(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(finalItem.body.data.title).toBe('Update from Client A');
    expect(finalItem.body.data.version).toBe(2);
  });

  // 6. Status transition with correct version succeeds
  it('6. Status transition with correct version succeeds and increments version', async () => {
    const item = await createWorkItem('Workflow Item');
    expect(item.status).toBe('OPEN');
    expect(item.version).toBe(1);

    const res = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'IN_PROGRESS',
        version: 1,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.version).toBe(2);
  });

  // 7. Status transition with stale version returns 409
  it('7. Status transition with stale version returns HTTP 409 STALE_WORK_ITEM', async () => {
    const item = await createWorkItem('Workflow Item');

    // First transition OPEN -> IN_PROGRESS: version 1 -> 2
    await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'IN_PROGRESS',
        version: 1,
      });

    // Second transition attempts with stale version 1
    const res = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'RESOLVED',
        version: 1,
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('STALE_WORK_ITEM');
  });

  // 8. Failed stale transition does not change status
  it('8. Failed stale transition does not change work item status', async () => {
    const item = await createWorkItem('Status Integrity Item');

    // Move to IN_PROGRESS (version 1 -> 2)
    await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'IN_PROGRESS',
        version: 1,
      });

    // Attempt stale transition to RESOLVED with version 1
    const staleRes = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'RESOLVED',
        version: 1,
      });
    expect(staleRes.status).toBe(409);

    // Verify item remains IN_PROGRESS and version remains 2
    const current = await request(app)
      .get(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(current.body.data.status).toBe('IN_PROGRESS');
    expect(current.body.data.version).toBe(2);
  });

  // 9. Version cannot be manually set to arbitrary value
  it('9. Version cannot be manually jumped or set to an arbitrary value', async () => {
    const item = await createWorkItem('Arbitrary Version Item');
    expect(item.version).toBe(1);

    // Attempting to jump version to 999
    const jumpRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Hacked Version',
        version: 999,
      });
    expect(jumpRes.status).toBe(409);
    expect(jumpRes.body.error.code).toBe('STALE_WORK_ITEM');

    // Attempting to pass non-integer or negative version is rejected by schema validator
    const invalidTypeRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Invalid Version Type',
        version: 'two',
      });
    expect(invalidTypeRes.status).toBe(400);
    expect(invalidTypeRes.body.error.code).toBe('VALIDATION_ERROR');

    const negativeRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Negative Version',
        version: -5,
      });
    expect(negativeRes.status).toBe(400);
    expect(negativeRes.body.error.code).toBe('VALIDATION_ERROR');
  });

  // 10. Version increments exactly once per successful mutation
  it('10. Version increments exactly once per successful mutation across mixed updates', async () => {
    const item = await createWorkItem('Increment Chain Item');
    expect(item.version).toBe(1);

    // Mutation 1: Update title (1 -> 2)
    const m1 = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Step 1', version: 1 });
    expect(m1.status).toBe(200);
    expect(m1.body.data.version).toBe(2);

    // Mutation 2: Status transition OPEN -> IN_PROGRESS (2 -> 3)
    const m2 = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'IN_PROGRESS', version: 2 });
    expect(m2.status).toBe(200);
    expect(m2.body.data.version).toBe(3);

    // Mutation 3: Update description (3 -> 4)
    const m3 = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: 'New Description', version: 3 });
    expect(m3.status).toBe(200);
    expect(m3.body.data.version).toBe(4);

    // Mutation 4: Status transition via PATCH /status (4 -> 5)
    const m4 = await request(app)
      .patch(`/api/work-items/${item.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'RESOLVED', version: 4 });
    expect(m4.status).toBe(200);
    expect(m4.body.data.version).toBe(5);
  });

  // 11. Existing workflow transition rules still apply
  it('11. Existing workflow transition rules still apply even when version is correct', async () => {
    const item = await createWorkItem('Transition Rule Test');
    expect(item.status).toBe('OPEN');
    expect(item.version).toBe(1);

    // Disallowed transition OPEN -> RESOLVED with valid version 1
    const res = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'RESOLVED',
        version: 1,
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  // 12. Invalid transition + stale version does not corrupt data
  it('12. Invalid transition + stale version is rejected and does not corrupt data', async () => {
    const item = await createWorkItem('Dual Invalid Test');

    // Progress item to version 2
    await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Bump to 2', version: 1 });

    // Send invalid transition OPEN -> RESOLVED AND stale version 1
    const res = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        status: 'RESOLVED',
        version: 1,
      });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);

    // Verify item remains intact
    const verify = await request(app)
      .get(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(verify.body.data.status).toBe('OPEN');
    expect(verify.body.data.version).toBe(2);
  });

  // 13. Cross-team authorization still works
  it('13. Cross-team authorization still rejects unauthorized users with 403', async () => {
    const item = await createWorkItem('Auth Check Item');

    const updateRes = await request(app)
      .patch(`/api/work-items/${item.id}`)
      .set('Authorization', `Bearer ${outsideUserToken}`)
      .send({ title: 'Unauthorized', version: 1 });
    expect(updateRes.status).toBe(403);
    expect(updateRes.body.error.code).toBe('FORBIDDEN');

    const transitionRes = await request(app)
      .post(`/api/work-items/${item.id}/transition`)
      .set('Authorization', `Bearer ${outsideUserToken}`)
      .send({ status: 'IN_PROGRESS', version: 1 });
    expect(transitionRes.status).toBe(403);
    expect(transitionRes.body.error.code).toBe('FORBIDDEN');
  });

  // 14. WorkItemService Isolated Unit Test verifying atomic update and conflict
  it('14. WorkItemService isolated unit test verifies atomic version comparison and conflict throwing', async () => {
    const customStore: WorkItemEntity[] = [
      {
        id: 'wi-occ-unit-1',
        title: 'OCC Unit Task',
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
      updateStatus: async () => customStore[0]!,
      updateWithVersion: async (
        id: string,
        expectedVersion: number,
        data: UpdateWorkItemData
      ) => {
        const target = customStore.find((i) => i.id === id)!;
        if (target.version !== expectedVersion) {
          throw new Error('Stale');
        }
        if (data.title) target.title = data.title;
        target.version += 1;
        return target;
      },
      updateStatusWithVersion: async (
        id: string,
        expectedVersion: number,
        status: WorkItemStatus
      ) => {
        const target = customStore.find((i) => i.id === id)!;
        if (target.version !== expectedVersion) {
          throw new Error('Stale');
        }
        target.status = status;
        target.version += 1;
        return target;
      },
      delete: async () => true,
    };

    const mockTeamRepo = {
      findById: async () => ({ id: 'team-mock', name: 'Mock', createdById: adminId, createdAt: new Date(), updatedAt: new Date() }),
      findByName: async () => null,
      findAll: async () => [],
      findByUserId: async () => [],
      create: async () => { throw new Error('Not implemented'); },
    };

    const mockTeamMemberRepo = {
      create: async () => { throw new Error('Not implemented'); },
      findByTeamAndUser: async () => ({ id: 'tm-1', teamId: 'team-mock', userId: adminId, role: TeamRole.ADMIN, createdAt: new Date() }),
      findMembersByTeamId: async () => [],
      updateRole: async () => { throw new Error('Not implemented'); },
      delete: async () => true,
    };

    const mockUserRepo = {
      findById: async () => ({ id: adminId, name: 'Alice', email: 'alice@opsflow.io', passwordHash: 'hash', createdAt: new Date(), updatedAt: new Date() }),
      findByEmail: async () => null,
      create: async () => { throw new Error('Not implemented'); },
    };

    const authz = new AuthorizationService(mockTeamMemberRepo, mockTeamRepo);
    const service = new WorkItemService(
      mockRepo,
      mockTeamRepo,
      mockTeamMemberRepo,
      mockUserRepo,
      authz
    );

    // 1. Successful update
    const updated = await service.updateWorkItem('wi-occ-unit-1', adminId, {
      title: 'New Title',
      version: 1,
    });
    expect(updated.version).toBe(2);

    // 2. Stale update throws STALE_WORK_ITEM conflict
    await expect(
      service.updateWorkItem('wi-occ-unit-1', adminId, {
        title: 'Conflict Title',
        version: 1,
      })
    ).rejects.toThrow('The work item has been modified since it was last read.');

    // 3. Status transition with current version 2 succeeds
    const transitioned = await service.transitionWorkItemStatus(
      'wi-occ-unit-1',
      adminId,
      WorkItemStatus.IN_PROGRESS,
      2
    );
    expect(transitioned.version).toBe(3);
    expect(transitioned.status).toBe(WorkItemStatus.IN_PROGRESS);

    // 4. Status transition with stale version 2 throws
    await expect(
      service.transitionWorkItemStatus(
        'wi-occ-unit-1',
        adminId,
        WorkItemStatus.RESOLVED,
        2
      )
    ).rejects.toThrow('The work item has been modified since it was last read.');
  });
});
