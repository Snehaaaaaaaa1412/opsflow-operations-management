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
import { TeamRole } from '@prisma/client';

// In-memory tables to simulate PostgreSQL behavior for authorization testing
let teamsTable: TeamEntity[] = [];
let teamMembersTable: TeamMemberEntity[] = [];
let usersTable: { id: string; name: string; email: string; passwordHash: string }[] = [];

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
            const error = new Error(
              'Unique constraint failed on the constraint: teams_name_key'
            );
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

function createTestToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwt.secret, { expiresIn: '1h' });
}

describe('Phase 2C — Resource-Level Authorization & Permissions', () => {
  // Common test fixtures
  const adminId = 'usr-admin-alice';
  const leadId = 'usr-lead-bob';
  const memberId = 'usr-member-charlie';
  const outsiderId = 'usr-outsider-dave';
  const targetUserId = 'usr-target-eve';

  const adminToken = createTestToken(adminId);
  const leadToken = createTestToken(leadId);
  const memberToken = createTestToken(memberId);
  const outsiderToken = createTestToken(outsiderId);

  let teamAId: string;
  let teamBId: string;

  beforeEach(async () => {
    teamsTable = [];
    teamMembersTable = [];
    usersTable = [
      { id: adminId, name: 'Alice Admin', email: 'alice@opsflow.io', passwordHash: 'hash-alice' },
      { id: leadId, name: 'Bob Lead', email: 'bob@opsflow.io', passwordHash: 'hash-bob' },
      { id: memberId, name: 'Charlie Member', email: 'charlie@opsflow.io', passwordHash: 'hash-charlie' },
      { id: outsiderId, name: 'Dave Outsider', email: 'dave@opsflow.io', passwordHash: 'hash-dave' },
      { id: targetUserId, name: 'Eve Target', email: 'eve@opsflow.io', passwordHash: 'hash-eve' },
    ];
    vi.clearAllMocks();

    // 1. Create Team A via adminId (admin becomes ADMIN member)
    const resA = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Platform Operations' });
    teamAId = resA.body.data.id;

    // Add Bob as TEAM_LEAD in Team A
    await request(app)
      .post(`/api/teams/${teamAId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: leadId, role: 'TEAM_LEAD' });

    // Add Charlie as MEMBER in Team A
    await request(app)
      .post(`/api/teams/${teamAId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: memberId, role: 'MEMBER' });

    // 2. Create Team B via outsiderId (outsider becomes ADMIN of Team B)
    const resB = await request(app)
      .post('/api/teams')
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Security Engineering' });
    teamBId = resB.body.data.id;
  });

  // =========================================================================
  // 1. Team Isolation (Tests 1 - 4)
  // =========================================================================
  describe('Team Isolation', () => {
    it('1. Member can access their own team details', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(teamAId);
      expect(res.body.data.name).toBe('Platform Operations');
    });

    it('2. Member cannot access another team\'s details (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamBId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have access to this team.');
    });

    it('3. Member cannot list another team\'s members (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamBId}/members`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('4. GET /api/teams only returns teams the authenticated user belongs to', async () => {
      // Member belongs only to Team A
      const resMember = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${memberToken}`);

      expect(resMember.status).toBe(200);
      expect(resMember.body.data).toHaveLength(1);
      expect(resMember.body.data[0].id).toBe(teamAId);

      // Outsider belongs only to Team B
      const resOutsider = await request(app)
        .get('/api/teams')
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(resOutsider.status).toBe(200);
      expect(resOutsider.body.data).toHaveLength(1);
      expect(resOutsider.body.data[0].id).toBe(teamBId);
    });
  });

  // =========================================================================
  // 2. ADMIN Permissions (Tests 5 - 8)
  // =========================================================================
  describe('ADMIN Permissions', () => {
    it('5. ADMIN can add a member to the team', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: targetUserId, role: 'MEMBER' });

      expect(res.status).toBe(201);
      expect(res.body.data.userId).toBe(targetUserId);
      expect(res.body.data.role).toBe('MEMBER');
    });

    it('6. ADMIN can remove any member from the team', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Member removed successfully.');

      const member = teamMembersTable.find(
        (m) => m.teamId === teamAId && m.userId === memberId
      );
      expect(member).toBeUndefined();
    });

    it('7. ADMIN can change a member\'s role', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'TEAM_LEAD' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('TEAM_LEAD');

      const updated = teamMembersTable.find(
        (m) => m.teamId === teamAId && m.userId === memberId
      );
      expect(updated?.role).toBe('TEAM_LEAD');
    });

    it('8. ADMIN can manage TEAM_LEAD roles (promote to ADMIN or demote to MEMBER)', async () => {
      // Demote TEAM_LEAD to MEMBER
      const demoteRes = await request(app)
        .patch(`/api/teams/${teamAId}/members/${leadId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MEMBER' });

      expect(demoteRes.status).toBe(200);
      expect(demoteRes.body.data.role).toBe('MEMBER');

      // Promote back to ADMIN
      const promoteRes = await request(app)
        .patch(`/api/teams/${teamAId}/members/${leadId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'ADMIN' });

      expect(promoteRes.status).toBe(200);
      expect(promoteRes.body.data.role).toBe('ADMIN');
    });
  });

  // =========================================================================
  // 3. TEAM_LEAD Permissions (Tests 9 - 15)
  // =========================================================================
  describe('TEAM_LEAD Permissions', () => {
    it('9. TEAM_LEAD can add MEMBER to the team', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ userId: targetUserId, role: 'MEMBER' });

      expect(res.status).toBe(201);
      expect(res.body.data.userId).toBe(targetUserId);
      expect(res.body.data.role).toBe('MEMBER');
    });

    it('10. TEAM_LEAD can remove MEMBER from the team', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${leadToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.message).toBe('Member removed successfully.');
    });

    it('11. TEAM_LEAD can change MEMBER role to TEAM_LEAD', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ role: 'TEAM_LEAD' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('TEAM_LEAD');
    });

    it('12. TEAM_LEAD cannot remove ADMIN (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamAId}/members/${adminId}`)
        .set('Authorization', `Bearer ${leadToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to remove this member.');
    });

    it('13. TEAM_LEAD cannot remove another TEAM_LEAD (returns 403 Forbidden)', async () => {
      // Add a second lead
      await request(app)
        .post(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: targetUserId, role: 'TEAM_LEAD' });

      const res = await request(app)
        .delete(`/api/teams/${teamAId}/members/${targetUserId}`)
        .set('Authorization', `Bearer ${leadToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to remove this member.');
    });

    it('14. TEAM_LEAD cannot promote MEMBER to ADMIN (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${leadToken}`)
        .send({ role: 'ADMIN' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to change this member\'s role.');
    });

    it('15. TEAM_LEAD cannot modify membership of another team (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamBId}/members/${outsiderId}`)
        .set('Authorization', `Bearer ${leadToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 4. MEMBER Permissions (Tests 16 - 20)
  // =========================================================================
  describe('MEMBER Permissions', () => {
    it('16. MEMBER can view team', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(teamAId);
    });

    it('17. MEMBER can view team members', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(3); // Alice (ADMIN), Bob (TEAM_LEAD), Charlie (MEMBER)
    });

    it('18. MEMBER cannot add members (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .post(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userId: targetUserId, role: 'MEMBER' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to add members with this role.');
    });

    it('19. MEMBER cannot remove members (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .delete(`/api/teams/${teamAId}/members/${leadId}`)
        .set('Authorization', `Bearer ${memberToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to remove this member.');
    });

    it('20. MEMBER cannot change roles (returns 403 Forbidden)', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/${leadId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have permission to change this member\'s role.');
    });
  });

  // =========================================================================
  // 5. Authentication vs Authorization (Tests 21 - 24)
  // =========================================================================
  describe('Authentication vs Authorization', () => {
    it('21. Missing JWT returns 401 UNAUTHORIZED', async () => {
      const res = await request(app).get(`/api/teams/${teamAId}`);

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('22. Invalid JWT returns 401 UNAUTHORIZED', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAId}`)
        .set('Authorization', 'Bearer invalid-jwt-token');

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });

    it('23. Valid JWT but no team membership returns 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get(`/api/teams/${teamAId}`)
        .set('Authorization', `Bearer ${outsiderToken}`);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
      expect(res.body.error.message).toBe('You do not have access to this team.');
    });

    it('24. Valid team membership but insufficient role returns 403 FORBIDDEN', async () => {
      // Charlie is a MEMBER of Team A, tries to add a user
      const res = await request(app)
        .post(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ userId: targetUserId });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  });

  // =========================================================================
  // 6. Role Changes & Validation (Tests 25 - 27)
  // =========================================================================
  describe('Role Changes & Validation', () => {
    it('25. Invalid role is rejected with 400 VALIDATION_ERROR', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'GOD_MODE' });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('26. Non-member target returns 404 MEMBER_NOT_FOUND', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/non-existent-user`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
      expect(res.body.error.message).toBe('Team member not found.');
    });

    it('27. Role update persists correctly and returns updated member', async () => {
      const res = await request(app)
        .patch(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'TEAM_LEAD' });

      expect(res.status).toBe(200);
      expect(res.body.data.role).toBe('TEAM_LEAD');
      expect(res.body.data.userId).toBe(memberId);
      expect(res.body.data.teamId).toBe(teamAId);
    });
  });

  // =========================================================================
  // 7. Resource Isolation & Data Safety (Tests 28 - 30)
  // =========================================================================
  describe('Resource Isolation & Data Safety', () => {
    it('28. User cannot modify a membership belonging to another team', async () => {
      // Alice is ADMIN of Team A, tries to patch outsider (ADMIN of Team B) on Team B
      const res = await request(app)
        .patch(`/api/teams/${teamBId}/members/${outsiderId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'MEMBER' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('29. User cannot use IDs from another team to bypass authorization', async () => {
      // Alice is ADMIN of Team A. Outsider is in Team B, not in Team A.
      // Alice attempts to remove Outsider using Team A's ID
      const res = await request(app)
        .delete(`/api/teams/${teamAId}/members/${outsiderId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe('MEMBER_NOT_FOUND');
    });

    it('30. No password or passwordHash is exposed in API responses', async () => {
      // Check GET /api/teams/:id/members
      const membersRes = await request(app)
        .get(`/api/teams/${teamAId}/members`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(membersRes.status).toBe(200);
      for (const m of membersRes.body.data) {
        expect(m.user).toBeDefined();
        expect(m.user).not.toHaveProperty('password');
        expect(m.user).not.toHaveProperty('passwordHash');
      }

      // Check PATCH /api/teams/:id/members/:userId
      const patchRes = await request(app)
        .patch(`/api/teams/${teamAId}/members/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ role: 'TEAM_LEAD' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.user).toBeDefined();
      expect(patchRes.body.data.user).not.toHaveProperty('password');
      expect(patchRes.body.data.user).not.toHaveProperty('passwordHash');
    });
  });
});
