import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config';
import { TeamEntity } from '../repositories/teamRepository';
import { TeamMemberEntity } from '../repositories/teamMemberRepository';
import { WorkItemEntity } from '../repositories/workItemRepository';
import { TeamRole, WorkItemPriority, WorkItemStatus } from '@prisma/client';

interface IdempotencyRecordMock {
  id: string;
  key: string;
  userId: string;
  operation: string;
  responseStatus: number;
  responseBody: any;
  createdAt: Date;
}

// In-memory mock tables
let teamsTable: TeamEntity[] = [];
let teamMembersTable: TeamMemberEntity[] = [];
let workItemsTable: WorkItemEntity[] = [];
let usersTable: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}[] = [];
let idempotencyRecordsTable: IdempotencyRecordMock[] = [];

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
        findMany: vi.fn(async () => [...teamsTable]),
        create: vi.fn(async ({ data }: { data: any }) => {
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
              userId_teamId?: { userId: string; teamId: string };
              id?: string;
            };
          }) => {
            if (where.userId_teamId) {
              return (
                teamMembersTable.find(
                  (tm) =>
                    tm.userId === where.userId_teamId!.userId &&
                    tm.teamId === where.userId_teamId!.teamId
                ) ?? null
              );
            }
            if (where.id) {
              return (
                teamMembersTable.find((tm) => tm.id === where.id) ?? null
              );
            }
            return null;
          }
        ),
        findMany: vi.fn(
          async ({ where }: { where?: { teamId?: string; userId?: string } } = {}) => {
            let res = [...teamMembersTable];
            if (where?.teamId) {
              res = res.filter((tm) => tm.teamId === where.teamId);
            }
            if (where?.userId) {
              res = res.filter((tm) => tm.userId === where.userId);
            }
            return res.map((tm) => {
              const u = usersTable.find((user) => user.id === tm.userId);
              return {
                ...tm,
                user: u
                  ? { id: u.id, name: u.name, email: u.email }
                  : { id: tm.userId, name: 'Unknown', email: 'unknown@example.com' },
              };
            });
          }
        ),
        create: vi.fn(async ({ data }: { data: any }) => {
          const newMember: TeamMemberEntity = {
            id: `tm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            userId: data.userId,
            teamId: data.teamId,
            role: data.role || TeamRole.MEMBER,
            createdAt: new Date(),
          };
          teamMembersTable.push(newMember);
          return newMember;
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = teamMembersTable.findIndex((tm) => tm.id === where.id);
          if (idx !== -1) {
            teamMembersTable.splice(idx, 1);
          }
          return {};
        }),
      },
      workItem: {
        findUnique: vi.fn(
          async ({
            where,
            include,
          }: {
            where: { id: string };
            include?: any;
          }) => {
            const item = workItemsTable.find((w) => w.id === where.id);
            if (!item) return null;
            const res: any = { ...item };
            if (include?.createdBy) {
              const u = usersTable.find((user) => user.id === item.createdById);
              res.createdBy = u
                ? { id: u.id, name: u.name, email: u.email }
                : { id: item.createdById, name: 'Creator', email: 'creator@example.com' };
            }
            if (include?.assignee && item.assigneeId) {
              const u = usersTable.find((user) => user.id === item.assigneeId);
              res.assignee = u
                ? { id: u.id, name: u.name, email: u.email }
                : null;
            }
            if (include?.team) {
              const t = teamsTable.find((tm) => tm.id === item.teamId);
              res.team = t ? { id: t.id, name: t.name } : { id: item.teamId, name: 'Team' };
            }
            return res;
          }
        ),
        findMany: vi.fn(async ({ where }: { where?: { teamId?: string } } = {}) => {
          let list = [...workItemsTable];
          if (where?.teamId) {
            list = list.filter((w) => w.teamId === where.teamId);
          }
          return list.map((item) => {
            const u = usersTable.find((user) => user.id === item.createdById);
            const a = item.assigneeId
              ? usersTable.find((user) => user.id === item.assigneeId)
              : null;
            const t = teamsTable.find((tm) => tm.id === item.teamId);
            return {
              ...item,
              createdBy: u ? { id: u.id, name: u.name, email: u.email } : undefined,
              assignee: a ? { id: a.id, name: a.name, email: a.email } : null,
              team: t ? { id: t.id, name: t.name } : undefined,
            };
          });
        }),
        create: vi.fn(async ({ data }: { data: any }) => {
          const newItem: WorkItemEntity = {
            id: `wi-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            title: data.title,
            description: data.description ?? null,
            status: data.status || WorkItemStatus.OPEN,
            priority: data.priority || WorkItemPriority.MEDIUM,
            teamId: data.teamId,
            createdById: data.createdById,
            assigneeId: data.assigneeId ?? null,
            version: 1,
            dueAt: data.dueAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          workItemsTable.push(newItem);
          const u = usersTable.find((user) => user.id === newItem.createdById);
          return {
            ...newItem,
            createdBy: u ? { id: u.id, name: u.name, email: u.email } : undefined,
            assignee: null,
            team: { id: newItem.teamId, name: 'Test Team' },
          };
        }),
        update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
          const idx = workItemsTable.findIndex((w) => w.id === where.id);
          if (idx === -1) {
            throw new Error('Record to update not found.');
          }
          const current = workItemsTable[idx]!;
          const updated: WorkItemEntity = {
            ...current,
            ...data,
            version: data.version?.increment
              ? current.version + 1
              : data.version !== undefined
              ? data.version
              : current.version,
            updatedAt: new Date(),
          };
          workItemsTable[idx] = updated;
          const u = usersTable.find((user) => user.id === updated.createdById);
          const a = updated.assigneeId
            ? usersTable.find((user) => user.id === updated.assigneeId)
            : null;
          return {
            ...updated,
            createdBy: u ? { id: u.id, name: u.name, email: u.email } : undefined,
            assignee: a ? { id: a.id, name: a.name, email: a.email } : null,
            team: { id: updated.teamId, name: 'Test Team' },
          };
        }),
        updateMany: vi.fn(async ({ where, data }: { where: { id: string; version: number }; data: any }) => {
          const idx = workItemsTable.findIndex(
            (w) => w.id === where.id && w.version === where.version
          );
          if (idx === -1) {
            return { count: 0 };
          }
          const current = workItemsTable[idx]!;
          const updated: WorkItemEntity = {
            ...current,
            ...data,
            version: data.version?.increment
              ? current.version + 1
              : data.version ?? current.version,
            updatedAt: new Date(),
          };
          workItemsTable[idx] = updated;
          return { count: 1 };
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = workItemsTable.findIndex((w) => w.id === where.id);
          if (idx !== -1) {
            workItemsTable.splice(idx, 1);
          }
          return {};
        }),
      },
      idempotencyRecord: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: {
              id?: string;
              key_userId?: { key: string; userId: string };
            };
          }) => {
            if (where.key_userId) {
              return (
                idempotencyRecordsTable.find(
                  (r) =>
                    r.key === where.key_userId!.key &&
                    r.userId === where.key_userId!.userId
                ) ?? null
              );
            }
            if (where.id) {
              return (
                idempotencyRecordsTable.find((r) => r.id === where.id) ?? null
              );
            }
            return null;
          }
        ),
        create: vi.fn(async ({ data }: { data: any }) => {
          const existing = idempotencyRecordsTable.find(
            (r) => r.key === data.key && r.userId === data.userId
          );
          if (existing) {
            const err: any = new Error(
              'Unique constraint failed on the fields: (`key`,`user_id`)'
            );
            err.code = 'P2002';
            throw err;
          }
          const newRecord: IdempotencyRecordMock = {
            id: `idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            key: data.key,
            userId: data.userId,
            operation: data.operation,
            responseStatus: data.responseStatus,
            responseBody: data.responseBody ?? null,
            createdAt: new Date(),
          };
          idempotencyRecordsTable.push(newRecord);
          return newRecord;
        }),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { key_userId: { key: string; userId: string } };
            data: any;
          }) => {
            const idx = idempotencyRecordsTable.findIndex(
              (r) =>
                r.key === where.key_userId.key &&
                r.userId === where.key_userId.userId
            );
            if (idx === -1) {
              throw new Error('Record not found to update');
            }
            idempotencyRecordsTable[idx] = {
              ...idempotencyRecordsTable[idx]!,
              ...data,
            };
            return idempotencyRecordsTable[idx]!;
          }
        ),
        delete: vi.fn(
          async ({
            where,
          }: {
            where: { key_userId: { key: string; userId: string } };
          }) => {
            const idx = idempotencyRecordsTable.findIndex(
              (r) =>
                r.key === where.key_userId.key &&
                r.userId === where.key_userId.userId
            );
            if (idx !== -1) {
              idempotencyRecordsTable.splice(idx, 1);
            }
            return {};
          }
        ),
      },
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return usersTable.find((u) => u.id === where.id) ?? null;
          if (where.email) return usersTable.find((u) => u.email === where.email) ?? null;
          return null;
        }),
      },
    },
  };
});

function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, { expiresIn: '1h' });
}

describe('Phase 7 — Idempotency & Duplicate Operation Protection', () => {
  const user1 = {
    id: 'user-id-alice-7',
    name: 'Alice Idem',
    email: 'alice.idem@example.com',
    passwordHash: 'hashed',
  };
  const user2 = {
    id: 'user-id-bob-7',
    name: 'Bob Idem',
    email: 'bob.idem@example.com',
    passwordHash: 'hashed',
  };

  let token1: string;
  let token2: string;
  let team: TeamEntity;

  beforeEach(() => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [user1, user2];
    idempotencyRecordsTable = [];

    token1 = generateToken(user1.id);
    token2 = generateToken(user2.id);

    team = {
      id: 'team-ops-7',
      name: 'Ops Team 7',
      createdById: user1.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    teamsTable.push(team);

    // Both user1 and user2 are members
    teamMembersTable.push({
      id: 'tm-1',
      userId: user1.id,
      teamId: team.id,
      role: TeamRole.ADMIN,
      createdAt: new Date(),
    });
    teamMembersTable.push({
      id: 'tm-2',
      userId: user2.id,
      teamId: team.id,
      role: TeamRole.MEMBER,
      createdAt: new Date(),
    });
  });

  describe('1. Work Item Creation Idempotency (POST /api/teams/:teamId/work-items)', () => {
    it('should execute normally on the first request and store the idempotency record', async () => {
      const key = 'idem-create-001';
      const payload = {
        title: 'Server Provisioning',
        description: 'Deploy cluster nodes',
        priority: 'HIGH',
      };

      const res = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.title).toBe('Server Provisioning');

      // Verify idempotency record in DB
      const record = idempotencyRecordsTable.find(
        (r) => r.key === key && r.userId === user1.id
      );
      expect(record).toBeDefined();
      expect(record!.responseStatus).toBe(201);
      expect(record!.responseBody).toEqual(res.body);
    });

    it('should return identical stored response on retry without creating duplicate item', async () => {
      const key = 'idem-create-002';
      const payload = {
        title: 'Database Backup',
        description: 'Nightly backup routine',
        priority: 'MEDIUM',
      };

      // First request
      const firstRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(firstRes.status).toBe(201);
      const createdItemId = firstRes.body.data.id;
      expect(workItemsTable.length).toBe(1);

      // Retry request with same key and payload
      const retryRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send(payload);

      expect(retryRes.status).toBe(201);
      expect(retryRes.body).toEqual(firstRes.body);
      expect(retryRes.body.data.id).toBe(createdItemId);

      // Verify no duplicate item was created in the database
      expect(workItemsTable.length).toBe(1);
    });

    it('should reject conflicting reuse of same key with different payload with 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const key = 'idem-create-conflict';
      const payload1 = {
        title: 'Initial Work',
        description: 'First payload',
      };
      const payload2 = {
        title: 'Different Work Item',
        description: 'Second payload with same key',
      };

      // First request succeeds
      const res1 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send(payload1);

      expect(res1.status).toBe(201);
      expect(workItemsTable.length).toBe(1);

      // Second request with different body fails with 409
      const res2 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send(payload2);

      expect(res2.status).toBe(409);
      expect(res2.body.error).toHaveProperty('code', 'IDEMPOTENCY_KEY_REUSED');
      expect(res2.body.error.message).toMatch(/different request parameters/i);

      // Database still has only 1 work item
      expect(workItemsTable.length).toBe(1);
    });

    it('should allow the same key to be used by different users without collision', async () => {
      const sharedKey = 'shared-user-key';
      const payload = {
        title: 'Shared Key Task',
      };

      // User 1 creates item
      const res1 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', sharedKey)
        .send(payload);

      expect(res1.status).toBe(201);

      // User 2 creates item with identical key and payload
      const res2 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token2}`)
        .set('Idempotency-Key', sharedKey)
        .send(payload);

      expect(res2.status).toBe(201);
      expect(res1.body.data.id).not.toBe(res2.body.data.id);

      // Both items exist in DB
      expect(workItemsTable.length).toBe(2);
      expect(idempotencyRecordsTable.length).toBe(2);
    });

    it('should handle concurrent duplicate requests atomically resulting in one actual operation', async () => {
      const key = 'idem-concurrent-create';
      const payload = {
        title: 'Concurrent Mission',
        priority: 'URGENT',
      };

      // Send 2 requests at the exact same time
      const [res1, res2] = await Promise.all([
        request(app)
          .post(`/api/teams/${team.id}/work-items`)
          .set('Authorization', `Bearer ${token1}`)
          .set('Idempotency-Key', key)
          .send(payload),
        request(app)
          .post(`/api/teams/${team.id}/work-items`)
          .set('Authorization', `Bearer ${token1}`)
          .set('Idempotency-Key', key)
          .send(payload),
      ]);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.data.id).toBe(res2.body.data.id);

      // Exactly ONE item was created in the database
      expect(workItemsTable.length).toBe(1);
    });

    it('should execute transparently when Idempotency-Key header is absent', async () => {
      const payload = {
        title: 'Standard Request Without Key',
      };

      const res1 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);

      const res2 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .send(payload);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.data.id).not.toBe(res2.body.data.id);
      expect(workItemsTable.length).toBe(2);
    });

    it('should reject invalid Idempotency-Key headers with 400 INVALID_IDEMPOTENCY_KEY', async () => {
      // Empty string
      const emptyRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', '')
        .send({ title: 'Task' });

      expect(emptyRes.status).toBe(400);
      expect(emptyRes.body.error).toHaveProperty(
        'code',
        'INVALID_IDEMPOTENCY_KEY'
      );

      // Whitespace only
      const wsRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', '   ')
        .send({ title: 'Task' });

      expect(wsRes.status).toBe(400);
      expect(wsRes.body.error).toHaveProperty(
        'code',
        'INVALID_IDEMPOTENCY_KEY'
      );

      // Longer than 255 chars
      const longKey = 'a'.repeat(256);
      const longRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', longKey)
        .send({ title: 'Task' });

      expect(longRes.status).toBe(400);
      expect(longRes.body.error).toHaveProperty(
        'code',
        'INVALID_IDEMPOTENCY_KEY'
      );
    });
  });

  describe('2. Status Transition Idempotency (POST /api/work-items/:id/transition)', () => {
    let workItem: WorkItemEntity;

    beforeEach(() => {
      workItem = {
        id: 'wi-trans-001',
        title: 'Task for Transition',
        description: null,
        status: WorkItemStatus.OPEN,
        priority: WorkItemPriority.MEDIUM,
        teamId: team.id,
        createdById: user1.id,
        assigneeId: null,
        version: 1,
        dueAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      workItemsTable.push(workItem);
    });

    it('should execute first status transition normally', async () => {
      const key = 'idem-trans-001';
      const res = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(res.body.data.version).toBe(2);

      // WorkItem version updated in DB
      const dbItem = workItemsTable.find((w) => w.id === workItem.id);
      expect(dbItem!.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(dbItem!.version).toBe(2);
    });

    it('should return stored response on retry and not apply transition or version increment twice', async () => {
      const key = 'idem-trans-retry';

      // First transition: OPEN -> IN_PROGRESS
      const firstRes = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(firstRes.body.data.version).toBe(2);

      // Retry transition with same key and original payload (version: 1)
      // Note: without idempotency, version 1 would be rejected as 409 stale update!
      const retryRes = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(retryRes.status).toBe(200);
      expect(retryRes.body).toEqual(firstRes.body);
      expect(retryRes.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(retryRes.body.data.version).toBe(2);

      // Verify DB state: version remains 2, not 3
      const dbItem = workItemsTable.find((w) => w.id === workItem.id);
      expect(dbItem!.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(dbItem!.version).toBe(2);
    });

    it('should reject reusing same key with different target status with 409 IDEMPOTENCY_KEY_REUSED', async () => {
      const key = 'idem-trans-conflict';

      // First request: OPEN -> IN_PROGRESS
      const res1 = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res1.status).toBe(200);

      // Second request reusing key for BLOCKED
      const res2 = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'BLOCKED', version: 1 });

      expect(res2.status).toBe(409);
      expect(res2.body.error).toHaveProperty('code', 'IDEMPOTENCY_KEY_REUSED');
    });

    it('should support idempotency on PATCH /api/work-items/:id/status endpoint', async () => {
      const key = 'idem-patch-status';

      const res1 = await request(app)
        .patch(`/api/work-items/${workItem.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);

      // Retry
      const res2 = await request(app)
        .patch(`/api/work-items/${workItem.id}/status`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ status: 'IN_PROGRESS', version: 1 });

      expect(res2.status).toBe(200);
      expect(res2.body).toEqual(res1.body);
    });
  });

  describe('3. Error Handling and Reservation Release', () => {
    it('should release reservation when validation fails so client can retry with valid data', async () => {
      const key = 'idem-val-fail';

      // Missing required 'title' field
      const failRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ priority: 'HIGH' });

      expect(failRes.status).toBe(400);

      // Reservation should have been deleted/released
      const record = idempotencyRecordsTable.find(
        (r) => r.key === key && r.userId === user1.id
      );
      expect(record).toBeUndefined();

      // Client retries with valid data using the same key
      const successRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({ title: 'Fixed Task Title', priority: 'HIGH' });

      expect(successRes.status).toBe(201);
      expect(successRes.body.data.title).toBe('Fixed Task Title');
    });

    it('should still enforce authentication when Idempotency-Key is provided', async () => {
      const res = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Idempotency-Key', 'no-auth-key')
        .send({ title: 'Unauthorized Item' });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should still enforce authorization when Idempotency-Key is provided', async () => {
      const outsider = {
        id: 'user-outsider',
        name: 'Outsider',
        email: 'outsider@example.com',
        passwordHash: 'hash',
      };
      usersTable.push(outsider);
      const outsiderToken = generateToken(outsider.id);

      const res = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${outsiderToken}`)
        .set('Idempotency-Key', 'outsider-key')
        .send({ title: 'Forbidden Item' });

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });
  });

  describe('4. Canonicalization and IdempotencyService Unit Tests', () => {
    it('should consider payloads with different key ordering as identical', async () => {
      const key = 'idem-canonical-order';

      const res1 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({
          title: 'Order Test',
          description: 'Desc',
          priority: 'MEDIUM',
        });

      expect(res1.status).toBe(201);

      // Same data with keys serialized in different order
      const res2 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${token1}`)
        .set('Idempotency-Key', key)
        .send({
          priority: 'MEDIUM',
          description: 'Desc',
          title: 'Order Test',
        });

      // Should return identical cached response rather than 409 conflict
      expect(res2.status).toBe(201);
      expect(res2.body).toEqual(res1.body);
      expect(workItemsTable.length).toBe(1);
    });

    it('should directly exercise IdempotencyService checkOrReserve and conflict handling in unit mode', async () => {
      const {
        IdempotencyService,
        computeOperationFingerprint,
      } = await import('../services/idempotencyService');

      const mockStore: any[] = [];
      const mockRepo: any = {
        findByKeyAndUserId: vi.fn(async (k: string, u: string) => {
          return mockStore.find((r) => r.key === k && r.userId === u) ?? null;
        }),
        create: vi.fn(async (data: any) => {
          const rec = { ...data, id: 'id-1', createdAt: new Date() };
          mockStore.push(rec);
          return rec;
        }),
        update: vi.fn(async (k: string, u: string, data: any) => {
          const idx = mockStore.findIndex((r) => r.key === k && r.userId === u);
          mockStore[idx] = { ...mockStore[idx], ...data };
          return mockStore[idx];
        }),
        delete: vi.fn(async (k: string, u: string) => {
          const idx = mockStore.findIndex((r) => r.key === k && r.userId === u);
          if (idx !== -1) mockStore.splice(idx, 1);
        }),
      };

      const service = new IdempotencyService(mockRepo);
      const op1 = computeOperationFingerprint('POST', '/api/test', { a: 1 });
      const op2 = computeOperationFingerprint('POST', '/api/test', { a: 2 });

      // First checkOrReserve reserves (completed: false)
      const res1 = await service.checkOrReserve('k1', 'u1', op1);
      expect(res1.completed).toBe(false);

      // Record success
      await service.recordSuccess('k1', 'u1', 200, { success: true });

      // Second checkOrReserve with same op returns completed: true
      const res2 = await service.checkOrReserve('k1', 'u1', op1);
      expect(res2.completed).toBe(true);
      if (res2.completed) {
        expect(res2.status).toBe(200);
        expect(res2.body).toEqual({ success: true });
      }

      // Third checkOrReserve with different op throws IDEMPOTENCY_KEY_REUSED
      await expect(
        service.checkOrReserve('k1', 'u1', op2)
      ).rejects.toThrowError(/different request parameters/i);
    });
  });
});
