import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config';
import { TeamEntity, CreateTeamData } from '../repositories/teamRepository';
import { TeamService } from '../services/teamService';

// In-memory team storage to simulate PostgreSQL behavior
let teamsTable: TeamEntity[] = [];

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
        findMany: vi.fn(async () => {
          return [...teamsTable].sort(
            (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
          );
        }),
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
      user: {
        findUnique: vi.fn(async () => null),
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
      const mockRepo = {
        findByName: async (name: string) => customStore.find((t) => t.name === name) ?? null,
        findById: async (id: string) => customStore.find((t) => t.id === id) ?? null,
        findAll: async () => [...customStore],
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

      const service = new TeamService(mockRepo);
      const team = await service.createTeam('DevOps', 'usr-test-owner');

      expect(team.name).toBe('DevOps');
      expect(team.createdById).toBe('usr-test-owner');

      const all = await service.listTeams();
      expect(all).toHaveLength(1);

      const retrieved = await service.getTeamById('mock-team-1');
      expect(retrieved.name).toBe('DevOps');
    });
  });
});
