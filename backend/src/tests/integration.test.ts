import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config';
import { TeamEntity } from '../repositories/teamRepository';
import { TeamMemberEntity } from '../repositories/teamMemberRepository';
import { WorkItemEntity } from '../repositories/workItemRepository';
import { CommentEntity } from '../repositories/commentRepository';
import { ActivityEntity } from '../repositories/activityRepository';
import { IdempotencyRecordEntity } from '../repositories/idempotencyRepository';
import { TeamRole, WorkItemPriority, WorkItemStatus } from '@prisma/client';

// ─── In-Memory Mock Store ─────────────────────────────────────────────────────

let teamsTable: TeamEntity[] = [];
let teamMembersTable: TeamMemberEntity[] = [];
let workItemsTable: WorkItemEntity[] = [];
let usersTable: {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
}[] = [];
let commentsTable: CommentEntity[] = [];
let activitiesTable: ActivityEntity[] = [];
let idempotencyRecordsTable: IdempotencyRecordEntity[] = [];

vi.mock('../models/prisma', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id) return usersTable.find((u) => u.id === where.id) ?? null;
          if (where.email) return usersTable.find((u) => u.email === where.email) ?? null;
          return null;
        }),
        create: vi.fn(async ({ data }: { data: any }) => {
          const newUser = {
            id: `u-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: data.name,
            email: data.email,
            passwordHash: data.passwordHash,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          usersTable.push(newUser);
          return newUser;
        }),
      },
      team: {
        findUnique: vi.fn(async ({ where }: { where: { id?: string; name?: string } }) => {
          if (where.name) return teamsTable.find((t) => t.name === where.name) ?? null;
          if (where.id) return teamsTable.find((t) => t.id === where.id) ?? null;
          return null;
        }),
        findMany: vi.fn(async () => [...teamsTable]),
        create: vi.fn(async ({ data }: { data: any }) => {
          const newTeam: TeamEntity = {
            id: `team-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            name: data.name,
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
              const tm = teamMembersTable.find(
                (m) =>
                  m.userId === where.userId_teamId!.userId &&
                  m.teamId === where.userId_teamId!.teamId
              );
              if (!tm) return null;
              const u = usersTable.find((user) => user.id === tm.userId);
              return {
                ...tm,
                user: u ? { id: u.id, name: u.name, email: u.email } : undefined,
              };
            }
            if (where.id) {
              const tm = teamMembersTable.find((m) => m.id === where.id);
              if (!tm) return null;
              const u = usersTable.find((user) => user.id === tm.userId);
              return {
                ...tm,
                user: u ? { id: u.id, name: u.name, email: u.email } : undefined,
              };
            }
            return null;
          }
        ),
        findMany: vi.fn(async ({ where }: { where?: { teamId?: string; userId?: string } } = {}) => {
          let res = [...teamMembersTable];
          if (where?.teamId) res = res.filter((tm) => tm.teamId === where.teamId);
          if (where?.userId) res = res.filter((tm) => tm.userId === where.userId);
          return res.map((tm) => {
            const u = usersTable.find((user) => user.id === tm.userId);
            return {
              ...tm,
              user: u ? { id: u.id, name: u.name, email: u.email } : undefined,
            };
          });
        }),
        create: vi.fn(async ({ data }: { data: any }) => {
          const newMember: TeamMemberEntity = {
            id: `tm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            userId: data.userId,
            teamId: data.teamId,
            role: data.role || TeamRole.MEMBER,
            createdAt: new Date(),
          };
          teamMembersTable.push(newMember);
          const u = usersTable.find((user) => user.id === newMember.userId);
          return {
            ...newMember,
            user: u ? { id: u.id, name: u.name, email: u.email } : undefined,
          };
        }),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { userId_teamId?: { userId: string; teamId: string } };
            data: { role: TeamRole };
          }) => {
            const idx = teamMembersTable.findIndex(
              (m) =>
                m.userId === where.userId_teamId!.userId &&
                m.teamId === where.userId_teamId!.teamId
            );
            if (idx === -1) throw new Error('TeamMember not found.');
            teamMembersTable[idx]!.role = data.role;
            const u = usersTable.find((user) => user.id === teamMembersTable[idx]!.userId);
            return {
              ...teamMembersTable[idx]!,
              user: u ? { id: u.id, name: u.name, email: u.email } : undefined,
            };
          }
        ),
        delete: vi.fn(
          async ({
            where,
          }: {
            where: { userId_teamId?: { userId: string; teamId: string }; id?: string };
          }) => {
            if (where.userId_teamId) {
              const idx = teamMembersTable.findIndex(
                (m) =>
                  m.userId === where.userId_teamId!.userId &&
                  m.teamId === where.userId_teamId!.teamId
              );
              if (idx !== -1) teamMembersTable.splice(idx, 1);
            } else if (where.id) {
              const idx = teamMembersTable.findIndex((m) => m.id === where.id);
              if (idx !== -1) teamMembersTable.splice(idx, 1);
            }
            return {};
          }
        ),
      },
      workItem: {
        findUnique: vi.fn(
          async ({ where, include }: { where: { id: string }; include?: any }) => {
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
              res.assignee = u ? { id: u.id, name: u.name, email: u.email } : null;
            }
            if (include?.team) {
              const t = teamsTable.find((tm) => tm.id === item.teamId);
              res.team = t ? { id: t.id, name: t.name } : { id: item.teamId, name: 'Team' };
            }
            return res;
          }
        ),
        findMany: vi.fn(
          async ({
            where,
            orderBy,
            skip,
            take,
          }: {
            where?: any;
            orderBy?: any;
            skip?: number;
            take?: number;
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
                    const q = clause.title.contains.toLowerCase();
                    return w.title.toLowerCase().includes(q);
                  }
                  if (clause.description?.contains) {
                    const q = clause.description.contains.toLowerCase();
                    return (w.description || '').toLowerCase().includes(q);
                  }
                  return false;
                });
              });
            }

            // Ordering
            if (orderBy) {
              const field = Object.keys(orderBy)[0];
              const dir = orderBy[field] || 'desc';
              list.sort((a: any, b: any) => {
                const valA = a[field];
                const valB = b[field];
                if (valA < valB) return dir === 'asc' ? -1 : 1;
                if (valA > valB) return dir === 'asc' ? 1 : -1;
                return 0;
              });
            }

            if (typeof skip === 'number' && typeof take === 'number') {
              list = list.slice(skip, skip + take);
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
          }
        ),
        count: vi.fn(async ({ where }: { where?: any } = {}) => {
          let list = [...workItemsTable];
          if (where?.teamId) list = list.filter((w) => w.teamId === where.teamId);
          if (where?.status) list = list.filter((w) => w.status === where.status);
          if (where?.priority) list = list.filter((w) => w.priority === where.priority);
          if (where?.assigneeId !== undefined) {
            list = list.filter((w) => w.assigneeId === where.assigneeId);
          }
          if (where?.OR && Array.isArray(where.OR)) {
            list = list.filter((w) => {
              return where.OR.some((clause: any) => {
                if (clause.title?.contains) {
                  return w.title.toLowerCase().includes(clause.title.contains.toLowerCase());
                }
                if (clause.description?.contains) {
                  return (w.description || '')
                    .toLowerCase()
                    .includes(clause.description.contains.toLowerCase());
                }
                return false;
              });
            });
          }
          return list.length;
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
          if (idx === -1) throw new Error('Record to update not found.');
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
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; version: number };
            data: any;
          }) => {
            const idx = workItemsTable.findIndex(
              (w) => w.id === where.id && w.version === where.version
            );
            if (idx === -1) return { count: 0 };
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
          }
        ),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = workItemsTable.findIndex((w) => w.id === where.id);
          if (idx !== -1) workItemsTable.splice(idx, 1);
          return {};
        }),
      },
      comment: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const u = usersTable.find((user) => user.id === data.authorId);
          const newComment: CommentEntity = {
            id: `comm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            workItemId: data.workItemId,
            authorId: data.authorId,
            body: data.body,
            content: data.body,
            createdAt: new Date(),
            updatedAt: new Date(),
            author: u ? { id: u.id, name: u.name, email: u.email } : undefined,
          };
          commentsTable.push(newComment);
          return newComment;
        }),
        findMany: vi.fn(async ({ where }: { where: { workItemId: string } }) => {
          return commentsTable
            .filter((c) => c.workItemId === where.workItemId)
            .map((c) => {
              const u = usersTable.find((user) => user.id === c.authorId);
              return {
                ...c,
                author: u ? { id: u.id, name: u.name, email: u.email } : undefined,
              };
            });
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const c = commentsTable.find((comm) => comm.id === where.id);
          if (!c) return null;
          const u = usersTable.find((user) => user.id === c.authorId);
          return {
            ...c,
            author: u ? { id: u.id, name: u.name, email: u.email } : undefined,
          };
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = commentsTable.findIndex((c) => c.id === where.id);
          if (idx !== -1) commentsTable.splice(idx, 1);
          return {};
        }),
      },
      activity: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const u = usersTable.find((user) => user.id === data.actorId);
          const newActivity: ActivityEntity = {
            id: `act-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            workItemId: data.workItemId,
            actorId: data.actorId,
            action: data.action,
            metadata: data.metadata ?? null,
            createdAt: new Date(),
            actor: u ? { id: u.id, name: u.name, email: u.email } : undefined,
          };
          activitiesTable.push(newActivity);
          return newActivity;
        }),
        findMany: vi.fn(async ({ where }: { where: { workItemId: string } }) => {
          return activitiesTable
            .filter((a) => a.workItemId === where.workItemId)
            .map((a) => {
              const u = usersTable.find((user) => user.id === a.actorId);
              return {
                ...a,
                actor: u ? { id: u.id, name: u.name, email: u.email } : undefined,
              };
            });
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
          const rec: IdempotencyRecordEntity = {
            id: `idem-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
            key: data.key,
            userId: data.userId,
            operation: data.operation,
            requestHash: data.requestHash,
            status: data.status,
            responseStatus: data.responseStatus ?? null,
            responseBody: data.responseBody ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          idempotencyRecordsTable.push(rec);
          return rec;
        }),
        update: vi.fn(
          async ({
            where,
            data,
          }: {
            where: {
              key_userId?: { key: string; userId: string };
              id?: string;
            };
            data: any;
          }) => {
            const idx = idempotencyRecordsTable.findIndex((r) => {
              if (where.key_userId) {
                return (
                  r.key === where.key_userId.key &&
                  r.userId === where.key_userId.userId
                );
              }
              if (where.id) return r.id === where.id;
              return false;
            });
            if (idx === -1) throw new Error('IdempotencyRecord not found');
            const current = idempotencyRecordsTable[idx]!;
            const updated: IdempotencyRecordEntity = {
              ...current,
              ...data,
              updatedAt: new Date(),
            };
            idempotencyRecordsTable[idx] = updated;
            return updated;
          }
        ),
      },
    },
  };
});

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createToken(userId: string, email: string): string {
  return jwt.sign({ sub: userId, id: userId, email }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
}

function seedUser(id: string, name: string, email: string) {
  const user = {
    id,
    name,
    email,
    passwordHash: 'hashed_pw_test',
  };
  usersTable.push(user);
  return { ...user, token: createToken(user.id, user.email) };
}

function seedTeam(id: string, name: string) {
  const team: TeamEntity = {
    id,
    name,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  teamsTable.push(team);
  return team;
}

function seedMembership(teamId: string, userId: string, role: TeamRole = TeamRole.MEMBER) {
  const membership: TeamMemberEntity = {
    id: `tm-${teamId}-${userId}`,
    teamId,
    userId,
    role,
    createdAt: new Date(),
  };
  teamMembersTable.push(membership);
  return membership;
}

function seedWorkItem(
  id: string,
  teamId: string,
  createdById: string,
  title = 'Test Work Item',
  status: WorkItemStatus = WorkItemStatus.OPEN,
  priority: WorkItemPriority = WorkItemPriority.MEDIUM,
  version = 1,
  assigneeId: string | null = null
) {
  const item: WorkItemEntity = {
    id,
    title,
    description: 'Initial description',
    status,
    priority,
    teamId,
    createdById,
    assigneeId,
    version,
    dueAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  workItemsTable.push(item);
  return item;
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('Phase 11: Critical Integration & Correctness Verification', () => {
  beforeEach(() => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [];
    commentsTable = [];
    activitiesTable = [];
    idempotencyRecordsTable = [];
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO A: Team Isolation
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario A: Team Isolation', () => {
    it('should strictly isolate teams and prevent unauthorized cross-team access across all modules', async () => {
      const userA = seedUser('user-a', 'Alice User', 'alice@team-a.com');
      const userB = seedUser('user-b', 'Bob User', 'bob@team-b.com');

      const teamA = seedTeam('team-a', 'Engineering Alpha');
      const teamB = seedTeam('team-b', 'Security Bravo');

      seedMembership(teamA.id, userA.id, TeamRole.MEMBER);
      seedMembership(teamB.id, userB.id, TeamRole.MEMBER);

      const itemA = seedWorkItem('wi-a', teamA.id, userA.id, 'Alpha Work Item');
      const itemB = seedWorkItem('wi-b', teamB.id, userB.id, 'Bravo Work Item');

      // 1 & 2. Users can access their own teams
      const ownTeamA = await request(app)
        .get(`/api/teams/${teamA.id}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(ownTeamA.status).toBe(200);

      const ownTeamB = await request(app)
        .get(`/api/teams/${teamB.id}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(ownTeamB.status).toBe(200);

      // 3 & 4. Users cannot access other teams (403)
      const crossTeamA = await request(app)
        .get(`/api/teams/${teamB.id}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(crossTeamA.status).toBe(403);
      expect(crossTeamA.body.error.code).toBe('FORBIDDEN');

      const crossTeamB = await request(app)
        .get(`/api/teams/${teamA.id}`)
        .set('Authorization', `Bearer ${userB.token}`);
      expect(crossTeamB.status).toBe(403);
      expect(crossTeamB.body.error.code).toBe('FORBIDDEN');

      // 5. User A cannot read Team B work items
      const readCrossQueue = await request(app)
        .get(`/api/teams/${teamB.id}/work-items`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(readCrossQueue.status).toBe(403);

      const readCrossItem = await request(app)
        .get(`/api/work-items/${itemB.id}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(readCrossItem.status).toBe(403);

      // 6. User A cannot modify Team B work items
      const updateCrossItem = await request(app)
        .patch(`/api/work-items/${itemB.id}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ title: 'Hacked Title', version: 1 });
      expect(updateCrossItem.status).toBe(403);
      expect(workItemsTable.find((w) => w.id === itemB.id)!.title).toBe('Bravo Work Item');

      // 7. User A cannot transition Team B work items
      const transCrossItem = await request(app)
        .post(`/api/work-items/${itemB.id}/transition`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ status: WorkItemStatus.IN_PROGRESS, version: 1 });
      expect(transCrossItem.status).toBe(403);
      expect(workItemsTable.find((w) => w.id === itemB.id)!.status).toBe(WorkItemStatus.OPEN);

      // 8. User A cannot comment on Team B work items
      const commentCrossItem = await request(app)
        .post(`/api/work-items/${itemB.id}/comments`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({ content: 'Unauthorized comment' });
      expect(commentCrossItem.status).toBe(403);
      expect(commentsTable.length).toBe(0);

      // 9. User A cannot read Team B activity history
      const activityCrossItem = await request(app)
        .get(`/api/work-items/${itemB.id}/activity`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(activityCrossItem.status).toBe(403);

      // 10. User A cannot manipulate Team B comments
      // User B adds a comment to their own work item
      const commentBRes = await request(app)
        .post(`/api/work-items/${itemB.id}/comments`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({ content: 'Valid Bravo comment' });
      expect(commentBRes.status).toBe(201);
      const commentBId = commentBRes.body.data.id;

      const deleteCrossComment = await request(app)
        .delete(`/api/work-items/${itemB.id}/comments/${commentBId}`)
        .set('Authorization', `Bearer ${userA.token}`);
      expect(deleteCrossComment.status).toBe(403);
      expect(commentsTable.some((c) => c.id === commentBId)).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO B: Complete Work Item Lifecycle
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario B: Complete Work Item Lifecycle', () => {
    it('should coordinate creation, mutations, assignee change, transitions, comments, and audit chronology', async () => {
      const creator = seedUser('user-creator', 'Creator User', 'creator@ops.internal');
      const assignee = seedUser('user-assignee', 'Assignee User', 'assignee@ops.internal');
      const team = seedTeam('team-lifecycle', 'Ops Lifecycle Team');

      seedMembership(team.id, creator.id, TeamRole.ADMIN);
      seedMembership(team.id, assignee.id, TeamRole.MEMBER);

      // 1. Create work item
      const createRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${creator.token}`)
        .send({
          title: 'Infrastructure Incident 404',
          description: 'Gateway returning intermittent 502/504 errors',
          priority: WorkItemPriority.HIGH,
        });

      expect(createRes.status).toBe(201);
      const workItem = createRes.body.data;
      expect(workItem.version).toBe(1);
      expect(workItem.status).toBe(WorkItemStatus.OPEN);

      // Verify WORK_ITEM_CREATED activity exists
      let activities = activitiesTable.filter((a) => a.workItemId === workItem.id);
      expect(activities.length).toBe(1);
      expect(activities[0]!.action).toBe('WORK_ITEM_CREATED');
      expect(activities[0]!.actorId).toBe(creator.id);

      // 2. Assignee updates item using version 1
      const updateRes = await request(app)
        .patch(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${assignee.token}`)
        .send({
          title: 'Infrastructure Incident 404 — Root Caused',
          priority: WorkItemPriority.URGENT,
          version: 1,
        });

      expect(updateRes.status).toBe(200);
      expect(updateRes.body.data.version).toBe(2);
      expect(updateRes.body.data.priority).toBe(WorkItemPriority.URGENT);

      // 3. Assign to member
      const assignRes = await request(app)
        .patch(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${creator.token}`)
        .send({
          assigneeId: assignee.id,
          version: 2,
        });

      expect(assignRes.status).toBe(200);
      expect(assignRes.body.data.version).toBe(3);
      expect(assignRes.body.data.assigneeId).toBe(assignee.id);

      // Verify ASSIGNEE_CHANGED activity
      activities = activitiesTable.filter((a) => a.workItemId === workItem.id);
      expect(activities.some((a) => a.action === 'ASSIGNEE_CHANGED')).toBe(true);

      // 4. Status transition OPEN -> IN_PROGRESS
      const trans1Res = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${assignee.token}`)
        .send({
          status: WorkItemStatus.IN_PROGRESS,
          version: 3,
        });

      expect(trans1Res.status).toBe(200);
      expect(trans1Res.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(trans1Res.body.data.version).toBe(4);

      // 5. Add collaboration comment
      const commentRes = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${assignee.token}`)
        .send({ content: 'Deployed hotfix to upstream proxy servers.' });

      expect(commentRes.status).toBe(201);
      const commentId = commentRes.body.data.id;

      // Verify COMMENT_ADDED activity
      activities = activitiesTable.filter((a) => a.workItemId === workItem.id);
      expect(activities.some((a) => a.action === 'COMMENT_ADDED')).toBe(true);

      // 6. Delete comment
      const deleteCommentRes = await request(app)
        .delete(`/api/work-items/${workItem.id}/comments/${commentId}`)
        .set('Authorization', `Bearer ${assignee.token}`);

      expect(deleteCommentRes.status).toBe(200);

      // Verify COMMENT_DELETED activity
      activities = activitiesTable.filter((a) => a.workItemId === workItem.id);
      expect(activities.some((a) => a.action === 'COMMENT_DELETED')).toBe(true);

      // 7. Status transition IN_PROGRESS -> RESOLVED -> CLOSED
      const trans2Res = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${assignee.token}`)
        .send({
          status: WorkItemStatus.RESOLVED,
          version: 4,
        });
      expect(trans2Res.status).toBe(200);
      expect(trans2Res.body.data.status).toBe(WorkItemStatus.RESOLVED);
      expect(trans2Res.body.data.version).toBe(5);

      const trans3Res = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${creator.token}`)
        .send({
          status: WorkItemStatus.CLOSED,
          version: 5,
        });
      expect(trans3Res.status).toBe(200);
      expect(trans3Res.body.data.status).toBe(WorkItemStatus.CLOSED);
      expect(trans3Res.body.data.version).toBe(6);

      // 8. Final detail check
      const detailRes = await request(app)
        .get(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${creator.token}`);

      expect(detailRes.status).toBe(200);
      expect(detailRes.body.data.status).toBe(WorkItemStatus.CLOSED);
      expect(detailRes.body.data.version).toBe(6);
      expect(detailRes.body.data.assigneeId).toBe(assignee.id);

      // 9. Activity audit history chronology check
      const activityRes = await request(app)
        .get(`/api/work-items/${workItem.id}/activity`)
        .set('Authorization', `Bearer ${creator.token}`);

      expect(activityRes.status).toBe(200);
      const auditLog = activityRes.body.data;
      expect(auditLog.length).toBeGreaterThanOrEqual(6);
      // Ensure timestamps are monotonically increasing or identical
      for (let i = 1; i < auditLog.length; i++) {
        const prev = new Date(auditLog[i - 1].createdAt).getTime();
        const curr = new Date(auditLog[i].createdAt).getTime();
        expect(curr).toBeGreaterThanOrEqual(prev);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO C: Invalid Workflow, Boundaries & State Invariants
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario C: Invalid Workflow', () => {
    it('should reject illegal transitions without altering state or creating spurious audit logs', async () => {
      const user = seedUser('user-flow', 'Flow User', 'flow@ops.internal');
      const team = seedTeam('team-flow', 'Workflow Team');
      seedMembership(team.id, user.id, TeamRole.MEMBER);

      const item = seedWorkItem('wi-flow', team.id, user.id, 'Workflow Validation Item');

      const initialActivityCount = activitiesTable.length;

      // 1. Invalid status transition (OPEN -> RESOLVED is illegal in state machine)
      const invalidRes = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          status: WorkItemStatus.RESOLVED,
          version: 1,
        });

      expect(invalidRes.status).toBe(400);
      expect(invalidRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');

      // State invariants remain intact
      const itemAfterInvalid = workItemsTable.find((w) => w.id === item.id)!;
      expect(itemAfterInvalid.status).toBe(WorkItemStatus.OPEN);
      expect(itemAfterInvalid.version).toBe(1);
      expect(activitiesTable.length).toBe(initialActivityCount);

      // 2. Non-existent work item transition returns 404
      const notFoundRes = await request(app)
        .post('/api/work-items/non-existent-wi-id/transition')
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          status: WorkItemStatus.IN_PROGRESS,
          version: 1,
        });

      expect(notFoundRes.status).toBe(404);
      expect(notFoundRes.body.error.code).toBe('WORK_ITEM_NOT_FOUND');

      // 3. Stale version on valid transition returns 409
      const staleRes = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({
          status: WorkItemStatus.IN_PROGRESS,
          version: 999, // Stale version
        });

      expect(staleRes.status).toBe(409);
      expect(staleRes.body.error.code).toBe('STALE_WORK_ITEM');

      // State unchanged
      const itemAfterStale = workItemsTable.find((w) => w.id === item.id)!;
      expect(itemAfterStale.status).toBe(WorkItemStatus.OPEN);
      expect(itemAfterStale.version).toBe(1);
      expect(activitiesTable.length).toBe(initialActivityCount);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO D: Optimistic Concurrency Control (OCC)
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario D: Optimistic Concurrency Control', () => {
    it('should permit exactly one update when two clients submit conflicting mutations on the same version', async () => {
      const userA = seedUser('user-occ-a', 'Client A', 'client-a@ops.internal');
      const userB = seedUser('user-occ-b', 'Client B', 'client-b@ops.internal');
      const team = seedTeam('team-occ', 'OCC Team');

      seedMembership(team.id, userA.id, TeamRole.MEMBER);
      seedMembership(team.id, userB.id, TeamRole.MEMBER);

      const item = seedWorkItem('wi-occ', team.id, userA.id, 'OCC Work Item', WorkItemStatus.OPEN, WorkItemPriority.LOW, 1);

      // Client A updates priority to HIGH with version 1
      const resA = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          priority: WorkItemPriority.HIGH,
          version: 1,
        });

      expect(resA.status).toBe(200);
      expect(resA.body.data.version).toBe(2);
      expect(resA.body.data.priority).toBe(WorkItemPriority.HIGH);

      // Client B attempts to update priority to URGENT with stale version 1
      const resB = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          priority: WorkItemPriority.URGENT,
          version: 1,
        });

      expect(resB.status).toBe(409);
      expect(resB.body.error.code).toBe('STALE_WORK_ITEM');

      // Database state remains Client A's successful modification
      const dbItem = workItemsTable.find((w) => w.id === item.id)!;
      expect(dbItem.priority).toBe(WorkItemPriority.HIGH);
      expect(dbItem.version).toBe(2);

      // Only one mutation audit record was created
      const occActivities = activitiesTable.filter((a) => a.workItemId === item.id);
      expect(occActivities.length).toBe(1);
      expect(occActivities[0]!.actorId).toBe(userA.id);
    });

    it('should enforce OCC on concurrent status transitions', async () => {
      const userA = seedUser('user-occ-trans-a', 'Trans A', 'trans-a@ops.internal');
      const userB = seedUser('user-occ-trans-b', 'Trans B', 'trans-b@ops.internal');
      const team = seedTeam('team-occ-trans', 'OCC Trans Team');

      seedMembership(team.id, userA.id, TeamRole.MEMBER);
      seedMembership(team.id, userB.id, TeamRole.MEMBER);

      const item = seedWorkItem('wi-occ-trans', team.id, userA.id, 'OCC Transition Item', WorkItemStatus.OPEN, WorkItemPriority.MEDIUM, 1);

      // Client A transitions to IN_PROGRESS at version 1
      const resA = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${userA.token}`)
        .send({
          status: WorkItemStatus.IN_PROGRESS,
          version: 1,
        });

      expect(resA.status).toBe(200);
      expect(resA.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(resA.body.data.version).toBe(2);

      // Client B attempts to transition to BLOCKED at version 1
      const resB = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${userB.token}`)
        .send({
          status: WorkItemStatus.BLOCKED,
          version: 1,
        });

      expect(resB.status).toBe(409);
      expect(resB.body.error.code).toBe('STALE_WORK_ITEM');

      // Item remains IN_PROGRESS at version 2
      const dbItem = workItemsTable.find((w) => w.id === item.id)!;
      expect(dbItem.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(dbItem.version).toBe(2);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO E: Idempotent Duplicate Operation Protection
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario E: Idempotency & Duplicate Operation Protection', () => {
    it('should replay cached response on duplicate create without double-creation or duplicate audit entries', async () => {
      const user = seedUser('user-idem-create', 'Idem User', 'idem@ops.internal');
      const team = seedTeam('team-idem', 'Idempotency Team');
      seedMembership(team.id, user.id, TeamRole.MEMBER);

      const idempotencyKey = 'create-item-key-uuid-123';

      // First Request
      const res1 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          title: 'Idempotent Incident Record',
          description: 'Network partition on cluster 3',
        });

      expect(res1.status).toBe(201);
      const createdItem = res1.body.data;

      // Second Request with identical key and payload
      const res2 = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          title: 'Idempotent Incident Record',
          description: 'Network partition on cluster 3',
        });

      expect(res2.status).toBe(201);
      expect(res2.body.data.id).toBe(createdItem.id);

      // Verify only 1 work item exists in database
      const itemsInTeam = workItemsTable.filter((w) => w.teamId === team.id);
      expect(itemsInTeam.length).toBe(1);

      // Verify only 1 audit record exists
      const creationActivities = activitiesTable.filter(
        (a) => a.workItemId === createdItem.id && a.action === 'WORK_ITEM_CREATED'
      );
      expect(creationActivities.length).toBe(1);
    });

    it('should replay status transition without double-incrementing version or duplicating audit logs', async () => {
      const user = seedUser('user-idem-trans', 'Idem Trans', 'idem-trans@ops.internal');
      const team = seedTeam('team-idem-trans', 'Idempotency Trans Team');
      seedMembership(team.id, user.id, TeamRole.MEMBER);

      const item = seedWorkItem('wi-idem-trans', team.id, user.id, 'Idem Trans Item', WorkItemStatus.OPEN, WorkItemPriority.MEDIUM, 1);
      const idempotencyKey = 'trans-item-key-uuid-456';

      // First Transition
      const res1 = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          status: WorkItemStatus.IN_PROGRESS,
          version: 1,
        });

      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(res1.body.data.version).toBe(2);

      // Second Transition with identical key and payload
      const res2 = await request(app)
        .post(`/api/work-items/${item.id}/transition`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          status: WorkItemStatus.IN_PROGRESS,
          version: 1,
        });

      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe(WorkItemStatus.IN_PROGRESS);
      expect(res2.body.data.version).toBe(2);

      // Item in DB version remains 2, not 3
      const dbItem = workItemsTable.find((w) => w.id === item.id)!;
      expect(dbItem.version).toBe(2);

      // Only 1 STATUS_CHANGED activity
      const transActivities = activitiesTable.filter(
        (a) => a.workItemId === item.id && a.action === 'STATUS_CHANGED'
      );
      expect(transActivities.length).toBe(1);
    });

    it('should reject idempotency key reuse with conflicting payload (409)', async () => {
      const user = seedUser('user-idem-conflict', 'Conflict User', 'conflict@ops.internal');
      const team = seedTeam('team-idem-conflict', 'Idem Conflict Team');
      seedMembership(team.id, user.id, TeamRole.MEMBER);

      const idempotencyKey = 'conflict-key-uuid-789';

      // First Request
      await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          title: 'Payload Alpha',
        });

      // Second Request with same key but different payload
      const conflictRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${user.token}`)
        .set('Idempotency-Key', idempotencyKey)
        .send({
          title: 'Payload Beta (Conflicting)',
        });

      expect(conflictRes.status).toBe(409);
      expect(conflictRes.body.error.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO F: Role-Based Authorization
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario F: Role-Based Authorization Matrix', () => {
    it('should enforce role boundaries across ADMIN, TEAM_LEAD, and MEMBER', async () => {
      const admin = seedUser('user-admin', 'Admin User', 'admin@ops.internal');
      const lead = seedUser('user-lead', 'Lead User', 'lead@ops.internal');
      const member = seedUser('user-member', 'Member User', 'member@ops.internal');
      const targetUser = seedUser('user-target', 'Target User', 'target@ops.internal');

      const team = seedTeam('team-roles', 'Role Matrix Team');

      seedMembership(team.id, admin.id, TeamRole.ADMIN);
      seedMembership(team.id, lead.id, TeamRole.TEAM_LEAD);
      seedMembership(team.id, member.id, TeamRole.MEMBER);

      // 1. ADMIN can add a member and assign TEAM_LEAD role
      const adminAddRes = await request(app)
        .post(`/api/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({
          userId: targetUser.id,
          role: TeamRole.TEAM_LEAD,
        });
      expect(adminAddRes.status).toBe(201);
      expect(adminAddRes.body.data.role).toBe(TeamRole.TEAM_LEAD);

      // ADMIN can update member role to ADMIN
      const adminUpdateRes = await request(app)
        .patch(`/api/teams/${team.id}/members/${targetUser.id}`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ role: TeamRole.ADMIN });
      expect(adminUpdateRes.status).toBe(200);
      expect(adminUpdateRes.body.data.role).toBe(TeamRole.ADMIN);

      // ADMIN can remove the target member
      const adminRemoveRes = await request(app)
        .delete(`/api/teams/${team.id}/members/${targetUser.id}`)
        .set('Authorization', `Bearer ${admin.token}`);
      expect(adminRemoveRes.status).toBe(200);

      // 2. TEAM_LEAD can add a MEMBER
      const leadAddMemberRes = await request(app)
        .post(`/api/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${lead.token}`)
        .send({
          userId: targetUser.id,
          role: TeamRole.MEMBER,
        });
      expect(leadAddMemberRes.status).toBe(201);

      // TEAM_LEAD CANNOT promote target to ADMIN (403)
      const leadPromoteAdminRes = await request(app)
        .patch(`/api/teams/${team.id}/members/${targetUser.id}`)
        .set('Authorization', `Bearer ${lead.token}`)
        .send({ role: TeamRole.ADMIN });
      expect(leadPromoteAdminRes.status).toBe(403);
      expect(leadPromoteAdminRes.body.error.code).toBe('FORBIDDEN');

      // TEAM_LEAD CANNOT remove ADMIN (403)
      const leadRemoveAdminRes = await request(app)
        .delete(`/api/teams/${team.id}/members/${admin.id}`)
        .set('Authorization', `Bearer ${lead.token}`);
      expect(leadRemoveAdminRes.status).toBe(403);

      // TEAM_LEAD can remove MEMBER
      const leadRemoveMemberRes = await request(app)
        .delete(`/api/teams/${team.id}/members/${targetUser.id}`)
        .set('Authorization', `Bearer ${lead.token}`);
      expect(leadRemoveMemberRes.status).toBe(200);

      // 3. MEMBER CANNOT add members (403)
      const memberAddRes = await request(app)
        .post(`/api/teams/${team.id}/members`)
        .set('Authorization', `Bearer ${member.token}`)
        .send({
          userId: targetUser.id,
          role: TeamRole.MEMBER,
        });
      expect(memberAddRes.status).toBe(403);

      // MEMBER CANNOT delete work items (only ADMIN and TEAM_LEAD can)
      const testItem = seedWorkItem('wi-del-test', team.id, admin.id);
      const memberDeleteWiRes = await request(app)
        .delete(`/api/work-items/${testItem.id}`)
        .set('Authorization', `Bearer ${member.token}`);
      expect(memberDeleteWiRes.status).toBe(403);

      // TEAM_LEAD can delete work item
      const leadDeleteWiRes = await request(app)
        .delete(`/api/work-items/${testItem.id}`)
        .set('Authorization', `Bearer ${lead.token}`);
      expect(leadDeleteWiRes.status).toBe(200);
      expect(workItemsTable.some((w) => w.id === testItem.id)).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO G: Audit Correctness
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario G: Audit Correctness', () => {
    it('should generate activity records strictly on successful mutations and never leak passwords', async () => {
      const user = seedUser('user-audit', 'Audit User', 'audit@ops.internal');
      const team = seedTeam('team-audit', 'Audit Verifier Team');
      seedMembership(team.id, user.id, TeamRole.ADMIN);

      // Create item
      const createRes = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ title: 'Audit Test Item' });
      expect(createRes.status).toBe(201);
      const item = createRes.body.data;

      // Failed mutation (invalid update payload - empty title)
      const failedRes = await request(app)
        .patch(`/api/work-items/${item.id}`)
        .set('Authorization', `Bearer ${user.token}`)
        .send({ title: '', version: 1 });
      expect(failedRes.status).toBe(400);

      // Fetch activity history
      const actRes = await request(app)
        .get(`/api/work-items/${item.id}/activity`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(actRes.status).toBe(200);
      const activities = actRes.body.data;

      // Only the successful create event is recorded
      expect(activities.length).toBe(1);
      expect(activities[0].action).toBe('WORK_ITEM_CREATED');
      expect(activities[0].actorId).toBe(user.id);
      expect(activities[0].workItemId).toBe(item.id);

      // Assert password or passwordHash is NEVER present anywhere in response
      const jsonResponse = JSON.stringify(actRes.body);
      expect(jsonResponse).not.toContain('passwordHash');
      expect(jsonResponse).not.toContain('hashed_pw_test');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SCENARIO H: Search & Pagination Integration
  // ───────────────────────────────────────────────────────────────────────────
  describe('Scenario H: Search / Filter / Sort / Pagination Integration', () => {
    it('should discover work items through combined database-level search, filters, sorting, and pagination', async () => {
      const user = seedUser('user-search', 'Search User', 'search@ops.internal');
      const teamA = seedTeam('team-search-a', 'Search Team A');
      const teamB = seedTeam('team-search-b', 'Search Team B');

      seedMembership(teamA.id, user.id, TeamRole.MEMBER);
      seedMembership(teamB.id, user.id, TeamRole.MEMBER);

      // Seed 25 items in Team A
      for (let i = 1; i <= 25; i++) {
        seedWorkItem(
          `wi-a-${i}`,
          teamA.id,
          user.id,
          i % 2 === 0 ? `Payment gateway incident #${i}` : `Database replica latency #${i}`,
          i % 3 === 0 ? WorkItemStatus.IN_PROGRESS : WorkItemStatus.OPEN,
          i % 4 === 0 ? WorkItemPriority.URGENT : WorkItemPriority.LOW,
          1,
          i % 2 === 0 ? user.id : null
        );
      }

      // Seed 5 items in Team B (to verify team isolation during search)
      for (let i = 1; i <= 5; i++) {
        seedWorkItem(
          `wi-b-${i}`,
          teamB.id,
          user.id,
          `Payment gateway incident in Team B #${i}`,
          WorkItemStatus.OPEN,
          WorkItemPriority.HIGH
        );
      }

      // 1. Default pagination on Team A (page 1, limit 20)
      const page1Res = await request(app)
        .get(`/api/teams/${teamA.id}/work-items`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(page1Res.status).toBe(200);
      expect(page1Res.body.data.length).toBe(20);
      expect(page1Res.body.meta).toEqual({
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
      });

      // 2. Page 2 returns remaining 5 items
      const page2Res = await request(app)
        .get(`/api/teams/${teamA.id}/work-items?page=2&limit=20`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(page2Res.status).toBe(200);
      expect(page2Res.body.data.length).toBe(5);

      // 3. Search query: 'payment' in Team A
      const searchRes = await request(app)
        .get(`/api/teams/${teamA.id}/work-items?search=payment`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(searchRes.status).toBe(200);
      // All items in result contain 'Payment'
      searchRes.body.data.forEach((item: WorkItemEntity) => {
        expect(item.title.toLowerCase()).toContain('payment');
        expect(item.teamId).toBe(teamA.id); // No leakage from Team B
      });

      // 4. Filter by unassigned items
      const unassignedRes = await request(app)
        .get(`/api/teams/${teamA.id}/work-items?assigneeId=unassigned`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(unassignedRes.status).toBe(200);
      unassignedRes.body.data.forEach((item: WorkItemEntity) => {
        expect(item.assigneeId).toBeNull();
      });

      // 5. Combined search + status + priority + pagination
      const combinedRes = await request(app)
        .get(`/api/teams/${teamA.id}/work-items?search=gateway&status=OPEN&limit=10&sortBy=title&sortOrder=asc`)
        .set('Authorization', `Bearer ${user.token}`);

      expect(combinedRes.status).toBe(200);
      expect(combinedRes.body.meta.page).toBe(1);
      expect(combinedRes.body.data.length).toBeLessThanOrEqual(10);
    });
  });
});
