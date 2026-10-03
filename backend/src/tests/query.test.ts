import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config';
import { TeamEntity } from '../repositories/teamRepository';
import { TeamMemberEntity } from '../repositories/teamMemberRepository';
import { WorkItemEntity } from '../repositories/workItemRepository';
import { TeamRole, WorkItemPriority, WorkItemStatus } from '@prisma/client';

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
              return teamMembersTable.find((tm) => tm.id === where.id) ?? null;
            }
            return null;
          }
        ),
      },
      workItem: {
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          return workItemsTable.find((w) => w.id === where.id) ?? null;
        }),
        findMany: vi.fn(
          async ({
            where,
            orderBy,
            skip = 0,
            take = 20,
            include,
          }: {
            where?: any;
            orderBy?: any;
            skip?: number;
            take?: number;
            include?: any;
          } = {}) => {
            let list = [...workItemsTable];

            if (where?.teamId) {
              list = list.filter((w) => w.teamId === where.teamId);
            }
            if (where?.status) {
              list = list.filter((w) => w.status === where.status);
            }
            if (where?.priority) {
              list = list.filter((w) => w.priority === where.priority);
            }
            if (where?.assigneeId !== undefined) {
              list = list.filter((w) => w.assigneeId === where.assigneeId);
            }
            if (where?.OR && Array.isArray(where.OR)) {
              list = list.filter((w) => {
                return where.OR.some((clause: any) => {
                  if (clause.title?.contains) {
                    const term = clause.title.contains.toLowerCase();
                    return w.title.toLowerCase().includes(term);
                  }
                  if (clause.description?.contains) {
                    const term = clause.description.contains.toLowerCase();
                    return (
                      w.description &&
                      w.description.toLowerCase().includes(term)
                    );
                  }
                  return false;
                });
              });
            }

            // Sorting
            if (orderBy) {
              const sortField = Object.keys(orderBy)[0] as keyof WorkItemEntity;
              const direction = orderBy[sortField] === 'asc' ? 1 : -1;
              list.sort((a, b) => {
                const valA = a[sortField];
                const valB = b[sortField];
                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;
                if (valA instanceof Date && valB instanceof Date) {
                  return (valA.getTime() - valB.getTime()) * direction;
                }
                return valA > valB ? direction : -direction;
              });
            }

            // Pagination
            const paginated = list.slice(skip, skip + take);

            return paginated.map((item) => {
              const u = usersTable.find((user) => user.id === item.createdById);
              const a = item.assigneeId
                ? usersTable.find((user) => user.id === item.assigneeId)
                : null;
              const t = teamsTable.find((tm) => tm.id === item.teamId);
              return {
                ...item,
                createdBy: u
                  ? { id: u.id, name: u.name, email: u.email }
                  : undefined,
                assignee: a
                  ? { id: a.id, name: a.name, email: a.email }
                  : null,
                team: t ? { id: t.id, name: t.name } : undefined,
              };
            });
          }
        ),
        count: vi.fn(async ({ where }: { where?: any } = {}) => {
          let list = [...workItemsTable];

          if (where?.teamId) {
            list = list.filter((w) => w.teamId === where.teamId);
          }
          if (where?.status) {
            list = list.filter((w) => w.status === where.status);
          }
          if (where?.priority) {
            list = list.filter((w) => w.priority === where.priority);
          }
          if (where?.assigneeId !== undefined) {
            list = list.filter((w) => w.assigneeId === where.assigneeId);
          }
          if (where?.OR && Array.isArray(where.OR)) {
            list = list.filter((w) => {
              return where.OR.some((clause: any) => {
                if (clause.title?.contains) {
                  const term = clause.title.contains.toLowerCase();
                  return w.title.toLowerCase().includes(term);
                }
                if (clause.description?.contains) {
                  const term = clause.description.contains.toLowerCase();
                  return (
                    w.description && w.description.toLowerCase().includes(term)
                  );
                }
                return false;
              });
            });
          }
          return list.length;
        }),
      },
      user: {
        findUnique: vi.fn(
          async ({ where }: { where: { id?: string; email?: string } }) => {
            if (where.id) return usersTable.find((u) => u.id === where.id) ?? null;
            if (where.email)
              return usersTable.find((u) => u.email === where.email) ?? null;
            return null;
          }
        ),
      },
    },
  };
});

function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, { expiresIn: '1h' });
}

describe('Phase 9 — Search, Filter, Sort & Pagination', () => {
  const alice = {
    id: 'user-alice-9',
    name: 'Alice TeamLead',
    email: 'alice.lead9@example.com',
    passwordHash: 'hashed',
  };
  const bob = {
    id: 'user-bob-9',
    name: 'Bob Dev',
    email: 'bob.dev9@example.com',
    passwordHash: 'hashed',
  };
  const outsider = {
    id: 'user-outsider-9',
    name: 'Outsider User',
    email: 'outsider9@example.com',
    passwordHash: 'hashed',
  };

  let tokenAlice: string;
  let tokenOutsider: string;
  let teamAlpha: TeamEntity;
  let teamBeta: TeamEntity;

  beforeEach(() => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [alice, bob, outsider];

    tokenAlice = generateToken(alice.id);
    tokenOutsider = generateToken(outsider.id);

    teamAlpha = {
      id: 'team-alpha-9',
      name: 'Alpha Squad',
      createdById: alice.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    teamBeta = {
      id: 'team-beta-9',
      name: 'Beta Squad',
      createdById: outsider.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    teamsTable.push(teamAlpha, teamBeta);

    // Alice and Bob are in Team Alpha
    teamMembersTable.push({
      id: 'tm-a1',
      userId: alice.id,
      teamId: teamAlpha.id,
      role: TeamRole.ADMIN,
      createdAt: new Date(),
    });
    teamMembersTable.push({
      id: 'tm-a2',
      userId: bob.id,
      teamId: teamAlpha.id,
      role: TeamRole.MEMBER,
      createdAt: new Date(),
    });

    // Outsider is in Team Beta
    teamMembersTable.push({
      id: 'tm-b1',
      userId: outsider.id,
      teamId: teamBeta.id,
      role: TeamRole.MEMBER,
      createdAt: new Date(),
    });

    // Seed 25 items in Team Alpha with diverse fields
    for (let i = 1; i <= 25; i++) {
      const status =
        i % 4 === 0
          ? WorkItemStatus.BLOCKED
          : i % 3 === 0
          ? WorkItemStatus.IN_PROGRESS
          : i % 5 === 0
          ? WorkItemStatus.RESOLVED
          : WorkItemStatus.OPEN;

      const priority =
        i % 4 === 0
          ? WorkItemPriority.URGENT
          : i % 3 === 0
          ? WorkItemPriority.HIGH
          : i % 2 === 0
          ? WorkItemPriority.MEDIUM
          : WorkItemPriority.LOW;

      const assigneeId = i % 2 === 0 ? bob.id : null;
      const title =
        i === 7
          ? 'Urgent Payment Gateway outage'
          : i === 14
          ? 'Reconcile payment ledger'
          : `Operational Work Item ${i.toString().padStart(2, '0')}`;

      const description =
        i === 7
          ? 'Critical failure in payment processor webhooks'
          : i === 20
          ? 'Payment reconciliation details inside'
          : `Detailed description for work item ${i}`;

      workItemsTable.push({
        id: `wi-alpha-${i}`,
        title,
        description,
        status,
        priority,
        teamId: teamAlpha.id,
        createdById: alice.id,
        assigneeId,
        version: 1,
        dueAt: null,
        createdAt: new Date(Date.now() - (25 - i) * 60000), // Chronological spacing
        updatedAt: new Date(Date.now() - (25 - i) * 30000),
      });
    }

    // Seed 3 items in Team Beta (isolation check)
    for (let i = 1; i <= 3; i++) {
      workItemsTable.push({
        id: `wi-beta-${i}`,
        title: `Beta Task ${i} with payment mention`,
        description: 'Beta description',
        status: WorkItemStatus.BLOCKED,
        priority: WorkItemPriority.HIGH,
        teamId: teamBeta.id,
        createdById: outsider.id,
        assigneeId: null,
        version: 1,
        dueAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  });

  describe('1. Pagination Structure & Defaults', () => {
    it('should default to page 1 and limit 20 and return pagination metadata', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(20);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
      });
    });

    it('should paginate to page 2 and return remaining 5 items', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?page=2&limit=20`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(5);
      expect(res.body.meta).toEqual({
        page: 2,
        limit: 20,
        total: 25,
        totalPages: 2,
      });
    });

    it('should support custom page sizes up to maximum limit of 100', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?page=1&limit=100`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(25);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 100,
        total: 25,
        totalPages: 1,
      });
    });

    it('should return empty data and 0 totalPages when page exceeds range', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?page=10&limit=20`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
      expect(res.body.meta).toEqual({
        page: 10,
        limit: 20,
        total: 25,
        totalPages: 2,
      });
    });
  });

  describe('2. Search (Title and Description)', () => {
    it('should search across title case-insensitively', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?search=payment`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      // Items 7 and 14 have "payment" in title, item 20 has "payment" in description
      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
      expect(res.body.meta.total).toBe(3);
      expect(
        res.body.data.every(
          (wi: any) =>
            wi.title.toLowerCase().includes('payment') ||
            wi.description?.toLowerCase().includes('payment')
        )
      ).toBe(true);
    });

    it('should search across description case-insensitively', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?search=webhooks`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].id).toBe('wi-alpha-7');
      expect(res.body.meta.total).toBe(1);
    });
  });

  describe('3. Filtering (Status, Priority, Assignee)', () => {
    it('should filter by status (BLOCKED)', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?status=BLOCKED`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((wi: any) => wi.status === WorkItemStatus.BLOCKED)
      ).toBe(true);
    });

    it('should filter by priority (URGENT)', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?priority=URGENT`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((wi: any) => wi.priority === WorkItemPriority.URGENT)
      ).toBe(true);
    });

    it('should filter by specific assigneeId', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?assigneeId=${bob.id}`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((wi: any) => wi.assigneeId === bob.id)
      ).toBe(true);
    });

    it('should support filtering for unassigned work items', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?assigneeId=unassigned`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(
        res.body.data.every((wi: any) => wi.assigneeId === null)
      ).toBe(true);
    });

    it('should combine multiple filters with search simultaneously', async () => {
      // Find items matching search "payment", status BLOCKED, priority URGENT
      const res = await request(app)
        .get(
          `/api/teams/${teamAlpha.id}/work-items?search=payment&status=BLOCKED&priority=URGENT`
        )
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      const found20 = res.body.data.find((wi: any) => wi.id === 'wi-alpha-20');
      expect(found20).toBeDefined();
      expect(found20.status).toBe(WorkItemStatus.BLOCKED);
      expect(found20.priority).toBe(WorkItemPriority.URGENT);
      expect(
        res.body.data.every(
          (wi: any) =>
            wi.status === WorkItemStatus.BLOCKED &&
            wi.priority === WorkItemPriority.URGENT
        )
      ).toBe(true);
    });
  });

  describe('4. Sorting & Direction', () => {
    it('should sort by title ascending', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?sortBy=title&sortOrder=asc&limit=5`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      const titles = res.body.data.map((wi: any) => wi.title);
      const sorted = [...titles].sort((a, b) => a.localeCompare(b));
      expect(titles).toEqual(sorted);
    });

    it('should sort by createdAt descending (newest first)', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?sortBy=createdAt&sortOrder=desc&limit=5`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      const timestamps = res.body.data.map((wi: any) =>
        new Date(wi.createdAt).getTime()
      );
      for (let i = 0; i < timestamps.length - 1; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i + 1]);
      }
    });

    it('should sort by priority ascending', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?sortBy=priority&sortOrder=asc&limit=10`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(10);
    });
  });

  describe('5. Input Validation & Bounds', () => {
    it('should reject limit greater than 100 with 400 validation error', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?limit=101`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(JSON.stringify(res.body.error)).toMatch(/100/);
    });

    it('should reject page less than 1 with 400', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?page=0`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject limit less than 1 with 400', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?limit=0`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid status with 400', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?status=INVALID_STATUS`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid priority with 400', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?priority=CRITICAL`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject unauthorized sort fields not in whitelist with 400', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?sortBy=passwordHash`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should reject invalid sortOrder with 400', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?sortOrder=random`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('6. Isolation & Empty Results', () => {
    it('should strictly isolate teams and prevent cross-team leakage in search', async () => {
      // Team Beta has an item mentioning "payment"
      // Team Alpha query for "payment" must NEVER return Beta items
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?search=payment`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(
        res.body.data.every((wi: any) => wi.teamId === teamAlpha.id)
      ).toBe(true);
      expect(
        res.body.data.some((wi: any) => wi.teamId === teamBeta.id)
      ).toBe(false);
    });

    it('should return empty list and zero counts when no matching records found', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items?search=nonexistentterm12345`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toEqual([]);
      expect(res.body.meta).toEqual({
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      });
    });

    it('should reject unauthenticated request to work items list with 401', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should reject non-team member from accessing team work items with 403', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAlpha.id}/work-items`)
        .set('Authorization', `Bearer ${tokenOutsider}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });
});
