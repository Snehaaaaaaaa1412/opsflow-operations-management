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
let commentsTable: CommentEntity[] = [];
let activitiesTable: ActivityEntity[] = [];

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
              return teamMembersTable.find((tm) => tm.id === where.id) ?? null;
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
      comment: {
        create: vi.fn(async ({ data }: { data: any }) => {
          const u = usersTable.find((user) => user.id === data.authorId);
          const newComment: CommentEntity = {
            id: `comment-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
          const c = commentsTable.find((item) => item.id === where.id);
          if (!c) return null;
          const u = usersTable.find((user) => user.id === c.authorId);
          return {
            ...c,
            author: u ? { id: u.id, name: u.name, email: u.email } : undefined,
          };
        }),
        findMany: vi.fn(async ({ where }: { where?: { workItemId?: string } } = {}) => {
          let list = [...commentsTable];
          if (where?.workItemId) {
            list = list.filter((c) => c.workItemId === where.workItemId);
          }
          return list.map((c) => {
            const u = usersTable.find((user) => user.id === c.authorId);
            return {
              ...c,
              author: u ? { id: u.id, name: u.name, email: u.email } : undefined,
            };
          });
        }),
        delete: vi.fn(async ({ where }: { where: { id: string } }) => {
          const idx = commentsTable.findIndex((c) => c.id === where.id);
          if (idx !== -1) {
            commentsTable.splice(idx, 1);
          }
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
        findMany: vi.fn(async ({ where }: { where?: { workItemId?: string } } = {}) => {
          let list = [...activitiesTable];
          if (where?.workItemId) {
            list = list.filter((a) => a.workItemId === where.workItemId);
          }
          return list.map((a) => {
            const u = usersTable.find((user) => user.id === a.actorId);
            return {
              ...a,
              actor: u ? { id: u.id, name: u.name, email: u.email } : undefined,
            };
          });
        }),
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

describe('Phase 8 — Comments & Activity/Audit History', () => {
  const alice = {
    id: 'user-alice-8',
    name: 'Alice Lead',
    email: 'alice.lead@example.com',
    passwordHash: 'secret-hash-1234',
  };
  const bob = {
    id: 'user-bob-8',
    name: 'Bob Member',
    email: 'bob.member@example.com',
    passwordHash: 'secret-hash-5678',
  };
  const charlie = {
    id: 'user-charlie-8',
    name: 'Charlie Member',
    email: 'charlie.member@example.com',
    passwordHash: 'secret-hash-9012',
  };
  const outsider = {
    id: 'user-outsider-8',
    name: 'Outsider Dave',
    email: 'outsider.dave@example.com',
    passwordHash: 'secret-hash-9999',
  };

  let tokenAlice: string;
  let tokenBob: string;
  let tokenCharlie: string;
  let tokenOutsider: string;
  let team: TeamEntity;
  let workItem: WorkItemEntity;

  beforeEach(() => {
    teamsTable = [];
    teamMembersTable = [];
    workItemsTable = [];
    usersTable = [alice, bob, charlie, outsider];
    commentsTable = [];
    activitiesTable = [];

    tokenAlice = generateToken(alice.id);
    tokenBob = generateToken(bob.id);
    tokenCharlie = generateToken(charlie.id);
    tokenOutsider = generateToken(outsider.id);

    team = {
      id: 'team-ops-8',
      name: 'Operations Team 8',
      createdById: alice.id,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    teamsTable.push(team);

    // Alice is TEAM_LEAD, Bob and Charlie are MEMBERs
    teamMembersTable.push({
      id: 'tm-alice',
      userId: alice.id,
      teamId: team.id,
      role: TeamRole.TEAM_LEAD,
      createdAt: new Date(),
    });
    teamMembersTable.push({
      id: 'tm-bob',
      userId: bob.id,
      teamId: team.id,
      role: TeamRole.MEMBER,
      createdAt: new Date(),
    });
    teamMembersTable.push({
      id: 'tm-charlie',
      userId: charlie.id,
      teamId: team.id,
      role: TeamRole.MEMBER,
      createdAt: new Date(),
    });

    workItem = {
      id: 'wi-ops-001',
      title: 'Database Failover Plan',
      description: 'Prepare documentation for primary-replica failover',
      status: WorkItemStatus.OPEN,
      priority: WorkItemPriority.HIGH,
      teamId: team.id,
      createdById: alice.id,
      assigneeId: bob.id,
      version: 1,
      dueAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    workItemsTable.push(workItem);
  });

  describe('1. Comments Module (POST, GET, DELETE)', () => {
    it('should allow team member to add a comment with server-enforced author', async () => {
      const res = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          content: 'I will start testing this on staging.',
          authorId: 'tampered-user-id', // Must be ignored
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toHaveProperty('id');
      expect(res.body.data.body).toBe('I will start testing this on staging.');
      expect(res.body.data.authorId).toBe(bob.id);
      expect(res.body.data.author).toEqual({
        id: bob.id,
        name: bob.name,
        email: bob.email,
      });
      // Ensure password hashes are never exposed
      expect(res.body.data.author).not.toHaveProperty('passwordHash');
      expect(res.body.data.author).not.toHaveProperty('password');

      // Verify comment stored in DB
      expect(commentsTable.length).toBe(1);
      expect(commentsTable[0]!.body).toBe('I will start testing this on staging.');
      expect(commentsTable[0]!.authorId).toBe(bob.id);
    });

    it('should reject comment creation if user is not in the work item team', async () => {
      const res = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenOutsider}`)
        .send({ content: 'Unauthorized comment' });

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
      expect(commentsTable.length).toBe(0);
    });

    it('should reject comment creation if unauthenticated', async () => {
      const res = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .send({ content: 'Anonymous comment' });

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
      expect(commentsTable.length).toBe(0);
    });

    it('should reject comment creation on non-existent work item with 404', async () => {
      const res = await request(app)
        .post('/api/work-items/non-existent-wi/comments')
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({ content: 'Orphan comment' });

      expect(res.status).toBe(404);
      expect(res.body.error).toHaveProperty('code', 'WORK_ITEM_NOT_FOUND');
    });

    it('should reject comment creation with invalid content (empty, whitespace, or over 2000 chars)', async () => {
      // Empty string
      const res1 = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({ content: '' });

      expect(res1.status).toBe(400);

      // Whitespace only
      const res2 = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({ content: '   ' });

      expect(res2.status).toBe(400);

      // Over 2000 characters
      const res3 = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({ content: 'x'.repeat(2001) });

      expect(res3.status).toBe(400);
      expect(commentsTable.length).toBe(0);
    });

    it('should list comments for authorized team members in chronological order', async () => {
      // Seed two comments
      commentsTable.push({
        id: 'comm-1',
        workItemId: workItem.id,
        authorId: bob.id,
        body: 'First comment',
        content: 'First comment',
        createdAt: new Date(Date.now() - 10000),
        updatedAt: new Date(Date.now() - 10000),
      });
      commentsTable.push({
        id: 'comm-2',
        workItemId: workItem.id,
        authorId: alice.id,
        body: 'Second comment',
        content: 'Second comment',
        createdAt: new Date(Date.now() - 5000),
        updatedAt: new Date(Date.now() - 5000),
      });

      const res = await request(app)
        .get(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenCharlie}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].body).toBe('First comment');
      expect(res.body.data[1].body).toBe('Second comment');
      expect(res.body.data[0].author).toHaveProperty('name', 'Bob Member');
      expect(res.body.data[1].author).toHaveProperty('name', 'Alice Lead');
      expect(res.body.data[0].author).not.toHaveProperty('passwordHash');
    });

    it('should reject comment listing for cross-team outsiders with 403', async () => {
      const res = await request(app)
        .get(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenOutsider}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should allow author to delete their own comment', async () => {
      commentsTable.push({
        id: 'comm-bob-delete',
        workItemId: workItem.id,
        authorId: bob.id,
        body: 'I made a typo here',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .delete(`/api/work-items/${workItem.id}/comments/comm-bob-delete`)
        .set('Authorization', `Bearer ${tokenBob}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('message');
      expect(commentsTable.length).toBe(0);
    });

    it('should allow team lead / admin to delete any comment in the team', async () => {
      commentsTable.push({
        id: 'comm-charlie-inappropriate',
        workItemId: workItem.id,
        authorId: charlie.id,
        body: 'Needs moderation',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Alice is TEAM_LEAD, can moderate/delete Charlie's comment
      const res = await request(app)
        .delete(`/api/work-items/${workItem.id}/comments/comm-charlie-inappropriate`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);
      expect(commentsTable.length).toBe(0);
    });

    it('should reject member deleting another member comment with 403 FORBIDDEN', async () => {
      commentsTable.push({
        id: 'comm-bob-mine',
        workItemId: workItem.id,
        authorId: bob.id,
        body: 'This belongs to Bob',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Charlie is just a MEMBER, trying to delete Bob's comment
      const res = await request(app)
        .delete(`/api/work-items/${workItem.id}/comments/comm-bob-mine`)
        .set('Authorization', `Bearer ${tokenCharlie}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
      expect(commentsTable.length).toBe(1);
    });

    it('should return 404 when deleting a non-existent comment', async () => {
      const res = await request(app)
        .delete(`/api/work-items/${workItem.id}/comments/non-existent-comment`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toHaveProperty('code', 'COMMENT_NOT_FOUND');
    });
  });

  describe('2. Activity / Audit Trail Generation', () => {
    it('should generate WORK_ITEM_CREATED activity when a new work item is created', async () => {
      const res = await request(app)
        .post(`/api/teams/${team.id}/work-items`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          title: 'Infrastructure Audit',
          description: 'Review security group configurations',
          priority: 'URGENT',
        });

      expect(res.status).toBe(201);
      const newWorkItemId = res.body.data.id;

      const createdAct = activitiesTable.find(
        (a) => a.workItemId === newWorkItemId && a.action === 'WORK_ITEM_CREATED'
      );
      expect(createdAct).toBeDefined();
      expect(createdAct!.actorId).toBe(alice.id);
      expect(createdAct!.metadata).toMatchObject({
        title: 'Infrastructure Audit',
        priority: 'URGENT',
        status: 'OPEN',
      });
    });

    it('should generate WORK_ITEM_UPDATED activity when work item fields are modified', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          title: 'Updated Failover Strategy',
          priority: 'URGENT',
          version: 1,
        });

      expect(res.status).toBe(200);

      const updateAct = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'WORK_ITEM_UPDATED'
      );
      expect(updateAct).toBeDefined();
      expect(updateAct!.actorId).toBe(bob.id);
      expect(updateAct!.metadata).toEqual({
        changes: {
          title: {
            from: 'Database Failover Plan',
            to: 'Updated Failover Strategy',
          },
          priority: {
            from: 'HIGH',
            to: 'URGENT',
          },
        },
      });
    });

    it('should generate ASSIGNEE_CHANGED activity when assignee is reassigned', async () => {
      const res = await request(app)
        .patch(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${tokenAlice}`)
        .send({
          assigneeId: charlie.id,
          version: 1,
        });

      expect(res.status).toBe(200);

      const assignAct = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'ASSIGNEE_CHANGED'
      );
      expect(assignAct).toBeDefined();
      expect(assignAct!.actorId).toBe(alice.id);
      expect(assignAct!.metadata).toEqual({
        from: bob.id,
        to: charlie.id,
      });
    });

    it('should generate STATUS_CHANGED activity when status is transitioned', async () => {
      const res = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          status: 'IN_PROGRESS',
          version: 1,
        });

      expect(res.status).toBe(200);

      const statusAct = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'STATUS_CHANGED'
      );
      expect(statusAct).toBeDefined();
      expect(statusAct!.actorId).toBe(bob.id);
      expect(statusAct!.metadata).toEqual({
        from: 'OPEN',
        to: 'IN_PROGRESS',
        version: 2,
      });
    });

    it('should generate COMMENT_ADDED and COMMENT_DELETED activities', async () => {
      // 1. Add comment
      const addRes = await request(app)
        .post(`/api/work-items/${workItem.id}/comments`)
        .set('Authorization', `Bearer ${tokenCharlie}`)
        .send({ content: 'Checking replica lag.' });

      expect(addRes.status).toBe(201);
      const commentId = addRes.body.data.id;

      const addAct = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'COMMENT_ADDED'
      );
      expect(addAct).toBeDefined();
      expect(addAct!.actorId).toBe(charlie.id);
      expect(addAct!.metadata).toEqual({ commentId });

      // 2. Delete comment
      const delRes = await request(app)
        .delete(`/api/work-items/${workItem.id}/comments/${commentId}`)
        .set('Authorization', `Bearer ${tokenCharlie}`);

      expect(delRes.status).toBe(200);

      const delAct = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'COMMENT_DELETED'
      );
      expect(delAct).toBeDefined();
      expect(delAct!.actorId).toBe(charlie.id);
      expect(delAct!.metadata).toEqual({ commentId });
    });

    it('should generate WORK_ITEM_DELETED activity before deleting work item', async () => {
      const res = await request(app)
        .delete(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(200);

      const delAct = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'WORK_ITEM_DELETED'
      );
      expect(delAct).toBeDefined();
      expect(delAct!.actorId).toBe(alice.id);
      expect(delAct!.metadata).toEqual({ title: 'Database Failover Plan' });
    });

    it('should NOT create activity records for failed mutations', async () => {
      // Failed transition: invalid state transition OPEN -> RESOLVED
      const res = await request(app)
        .post(`/api/work-items/${workItem.id}/transition`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          status: 'RESOLVED',
          version: 1,
        });

      expect(res.status).toBe(400);

      // Verify no STATUS_CHANGED activity created
      const act = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'STATUS_CHANGED'
      );
      expect(act).toBeUndefined();
    });

    it('should NOT create activity records when stale concurrency check fails', async () => {
      // Stale update: sending version 99 when actual is 1
      const res = await request(app)
        .patch(`/api/work-items/${workItem.id}`)
        .set('Authorization', `Bearer ${tokenBob}`)
        .send({
          title: 'Stale Title Attempt',
          version: 99,
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toHaveProperty('code', 'STALE_WORK_ITEM');

      const act = activitiesTable.find(
        (a) => a.workItemId === workItem.id && a.action === 'WORK_ITEM_UPDATED'
      );
      expect(act).toBeUndefined();
    });
  });

  describe('3. Activity History Endpoint (GET /api/work-items/:id/activity)', () => {
    it('should return chronological activity history with safe actor summary', async () => {
      // Seed activity trail
      activitiesTable.push({
        id: 'act-1',
        workItemId: workItem.id,
        actorId: alice.id,
        action: 'WORK_ITEM_CREATED',
        metadata: { title: workItem.title },
        createdAt: new Date('2026-10-03T10:00:00Z'),
      });
      activitiesTable.push({
        id: 'act-2',
        workItemId: workItem.id,
        actorId: bob.id,
        action: 'STATUS_CHANGED',
        metadata: { from: 'OPEN', to: 'IN_PROGRESS' },
        createdAt: new Date('2026-10-03T10:15:00Z'),
      });

      const res = await request(app)
        .get(`/api/work-items/${workItem.id}/activity`)
        .set('Authorization', `Bearer ${tokenCharlie}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].action).toBe('WORK_ITEM_CREATED');
      expect(res.body.data[0].actor).toEqual({
        id: alice.id,
        name: alice.name,
        email: alice.email,
      });
      expect(res.body.data[1].action).toBe('STATUS_CHANGED');
      expect(res.body.data[1].actor).toEqual({
        id: bob.id,
        name: bob.name,
        email: bob.email,
      });

      // No sensitive fields
      expect(res.body.data[0].actor).not.toHaveProperty('passwordHash');
      expect(res.body.data[1].actor).not.toHaveProperty('password');
    });

    it('should deny cross-team outsiders from viewing activity history with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get(`/api/work-items/${workItem.id}/activity`)
        .set('Authorization', `Bearer ${tokenOutsider}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toHaveProperty('code', 'FORBIDDEN');
    });

    it('should return 404 when querying activity for a non-existent work item', async () => {
      const res = await request(app)
        .get('/api/work-items/non-existent-wi/activity')
        .set('Authorization', `Bearer ${tokenAlice}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toHaveProperty('code', 'WORK_ITEM_NOT_FOUND');
    });

    it('should require authentication for activity endpoint', async () => {
      const res = await request(app)
        .get(`/api/work-items/${workItem.id}/activity`);

      expect(res.status).toBe(401);
      expect(res.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });
});
