import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import app from '../app';
import { config } from '../config';
import { UserEntity, CreateUserData } from '../repositories/userRepository';
import { AuthService } from '../services/authService';

// In-memory user storage to simulate PostgreSQL database behavior
let usersTable: UserEntity[] = [];

vi.mock('../models/prisma', () => {
  return {
    prisma: {
      user: {
        findUnique: vi.fn(
          async ({ where }: { where: { id?: string; email?: string } }) => {
            if (where.email) {
              return usersTable.find((u) => u.email === where.email) ?? null;
            }
            if (where.id) {
              return usersTable.find((u) => u.id === where.id) ?? null;
            }
            return null;
          }
        ),
        create: vi.fn(async ({ data }: { data: CreateUserData }) => {
          const existing = usersTable.find((u) => u.email === data.email);
          if (existing) {
            const error = new Error('Unique constraint failed on the constraint: users_email_key');
            (error as any).code = 'P2002';
            throw error;
          }
          const newUser: UserEntity = {
            id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
    },
  };
});

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    usersTable = [];
    vi.clearAllMocks();
  });

  describe('Successful Registration', () => {
    it('should register a new user and return 201 with safe user representation', async () => {
      const payload = {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'SecurePassword123',
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toMatchObject({
        name: 'Alice',
        email: 'alice@example.com',
      });
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.createdAt).toBeDefined();
      expect(res.body.data.updatedAt).toBeDefined();

      // CRITICAL SECURITY ASSERTIONS: Never leak passwords or password hashes
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');

      // Verify persistence in storage
      expect(usersTable).toHaveLength(1);
      expect(usersTable[0].email).toBe('alice@example.com');
    });

    it('should normalize email by trimming and converting to lowercase', async () => {
      const payload = {
        name: 'Bob',
        email: '  BOB.Smith@Example.COM  ',
        password: 'SecurePassword123',
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(res.body.data.email).toBe('bob.smith@example.com');
      expect(usersTable[0].email).toBe('bob.smith@example.com');
    });
  });

  describe('Password Security & Hashing', () => {
    it('should store password as a bcrypt hash, never as plaintext', async () => {
      const rawPassword = 'MySecretPassword999';
      const payload = {
        name: 'Charlie',
        email: 'charlie@example.com',
        password: rawPassword,
      };

      const res = await request(app).post('/api/auth/register').send(payload);

      expect(res.status).toBe(201);
      expect(usersTable).toHaveLength(1);

      const storedUser = usersTable[0];

      // Password must NOT be plaintext
      expect(storedUser.passwordHash).not.toBe(rawPassword);
      expect(storedUser.passwordHash.startsWith('$2b$')).toBe(true);

      // Bcrypt verification must succeed
      const isMatch = await bcrypt.compare(rawPassword, storedUser.passwordHash);
      expect(isMatch).toBe(true);

      // Comparison with wrong password must fail
      const isWrongMatch = await bcrypt.compare('WrongPassword', storedUser.passwordHash);
      expect(isWrongMatch).toBe(false);
    });
  });

  describe('Duplicate Email Handling (Uniqueness)', () => {
    it('should return 409 Conflict when registering with an existing email', async () => {
      const payload = {
        name: 'Alice',
        email: 'alice@example.com',
        password: 'SecurePassword123',
      };

      // First registration succeeds
      const firstRes = await request(app).post('/api/auth/register').send(payload);
      expect(firstRes.status).toBe(201);
      expect(usersTable).toHaveLength(1);

      // Second registration with same email fails
      const duplicateRes = await request(app).post('/api/auth/register').send(payload);

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body).toHaveProperty('error');
      expect(duplicateRes.body.error).toEqual({
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email already exists.',
      });

      // Crucial: Must not create a duplicate user record
      expect(usersTable).toHaveLength(1);
    });

    it('should return 409 Conflict when email differs only by case or whitespace', async () => {
      await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'SecurePassword123',
      });

      const duplicateRes = await request(app).post('/api/auth/register').send({
        name: 'Alice Duplicate',
        email: '  ALICE@EXAMPLE.COM  ',
        password: 'AnotherPassword456',
      });

      expect(duplicateRes.status).toBe(409);
      expect(duplicateRes.body.error.code).toBe('EMAIL_ALREADY_EXISTS');
      expect(usersTable).toHaveLength(1);
    });
  });

  describe('Validation Failures', () => {
    it('should return 400 when email format is invalid', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'not-an-email',
        password: 'SecurePassword123',
      });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.message).toBe('Validation failed');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
          }),
        ])
      );
      expect(usersTable).toHaveLength(0);
    });

    it('should return 400 when name is missing or empty', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: '   ',
        email: 'alice@example.com',
        password: 'SecurePassword123',
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
      expect(usersTable).toHaveLength(0);
    });

    it('should return 400 when password is shorter than 8 characters', async () => {
      const res = await request(app).post('/api/auth/register').send({
        name: 'Alice',
        email: 'alice@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
          }),
        ])
      );
      expect(usersTable).toHaveLength(0);
    });

    it('should return 400 when required fields are completely missing', async () => {
      const res = await request(app).post('/api/auth/register').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(3);
      expect(usersTable).toHaveLength(0);
    });
  });

  describe('AuthService Isolated Unit Tests', () => {
    it('should correctly map safe user and omit passwordHash in unit call', async () => {
      const customStore: UserEntity[] = [];
      const mockRepo = {
        findByEmail: async (email: string) => customStore.find((u) => u.email === email) ?? null,
        findById: async (id: string) => customStore.find((u) => u.id === id) ?? null,
        create: async (data: CreateUserData) => {
          const user: UserEntity = {
            id: 'mock-id-123',
            name: data.name,
            email: data.email,
            passwordHash: data.passwordHash,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          customStore.push(user);
          return user;
        },
      };

      const service = new AuthService(mockRepo);
      const safeUser = await service.register({
        name: 'Unit Tester',
        email: 'tester@opsflow.io',
        password: 'StrongPassword123',
      });

      expect(safeUser.id).toBe('mock-id-123');
      expect(safeUser.name).toBe('Unit Tester');
      expect(safeUser.email).toBe('tester@opsflow.io');
      expect((safeUser as any).passwordHash).toBeUndefined();
      expect((safeUser as any).password).toBeUndefined();
    });
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    usersTable = [];
    vi.clearAllMocks();

    // Register a baseline user for login testing
    const passwordHash = await bcrypt.hash('SecurePassword123', 10);
    usersTable.push({
      id: 'usr-baseline-123',
      name: 'Alice',
      email: 'alice@example.com',
      passwordHash,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  describe('Successful Authentication', () => {
    it('should authenticate valid credentials and return 200 with JWT and safe user object', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'SecurePassword123',
      });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data).toHaveProperty('user');

      // User object verification
      const user = res.body.data.user;
      expect(user.id).toBe('usr-baseline-123');
      expect(user.name).toBe('Alice');
      expect(user.email).toBe('alice@example.com');
      expect(user.createdAt).toBeDefined();
      expect(user.updatedAt).toBeDefined();

      // CRITICAL SECURITY ASSERTIONS: Never leak passwords or hashes
      expect(user).not.toHaveProperty('password');
      expect(user).not.toHaveProperty('passwordHash');
      expect(res.body.data).not.toHaveProperty('password');
      expect(res.body.data).not.toHaveProperty('passwordHash');
      expect(res.body).not.toHaveProperty('password');
      expect(res.body).not.toHaveProperty('passwordHash');

      // Token verification
      const token = res.body.data.token;
      expect(typeof token).toBe('string');

      const decoded = jwt.verify(token, config.jwt.secret) as jwt.JwtPayload;
      expect(decoded.sub).toBe('usr-baseline-123');
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded).not.toHaveProperty('password');
      expect(decoded).not.toHaveProperty('passwordHash');
    });

    it('should normalize email on login (trim and lowercase) for case-insensitive authentication', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: '   ALICE@EXAMPLE.COM   ',
        password: 'SecurePassword123',
      });

      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('alice@example.com');
      expect(res.body.data.token).toBeDefined();
    });
  });

  describe('Authentication Failures (Anti-Enumeration Protection)', () => {
    it('should return generic 401 when email does not exist', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'SecurePassword123',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    });

    it('should return generic 401 when password is incorrect', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'WrongPassword999',
      });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
      expect(res.body.error).toEqual({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    });

    it('should return identical error structure for non-existent user and wrong password to prevent enumeration', async () => {
      const nonExistentRes = await request(app).post('/api/auth/login').send({
        email: 'ghost@example.com',
        password: 'SomePassword123',
      });

      const wrongPasswordRes = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'WrongPassword999',
      });

      expect(nonExistentRes.status).toBe(401);
      expect(wrongPasswordRes.status).toBe(401);
      expect(nonExistentRes.body).toEqual(wrongPasswordRes.body);
    });
  });

  describe('Validation Failures', () => {
    it('should return 400 when email is invalid', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'invalid-email',
        password: 'SecurePassword123',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
          }),
        ])
      );
    });

    it('should return 400 when password is shorter than 8 characters', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'alice@example.com',
        password: 'short',
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
          }),
        ])
      );
    });

    it('should return 400 when required fields are missing', async () => {
      const res = await request(app).post('/api/auth/login').send({});

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('AuthService Isolated Unit Tests for Login', () => {
    it('should return JWT and safe user on valid credentials in unit call', async () => {
      const passwordHash = await bcrypt.hash('UnitPass123', 10);
      const mockRepo = {
        findByEmail: async (email: string) => {
          if (email === 'unit@opsflow.io') {
            return {
              id: 'unit-usr-999',
              name: 'Unit Tester',
              email: 'unit@opsflow.io',
              passwordHash,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
          }
          return null;
        },
        findById: async () => null,
        create: async () => {
          throw new Error('Not implemented');
        },
      };

      const service = new AuthService(mockRepo);
      const result = await service.login({
        email: 'unit@opsflow.io',
        password: 'UnitPass123',
      });

      expect(result.token).toBeDefined();
      expect(result.user.id).toBe('unit-usr-999');
      expect(result.user.email).toBe('unit@opsflow.io');
      expect((result.user as any).passwordHash).toBeUndefined();

      const decoded = jwt.verify(result.token, config.jwt.secret) as jwt.JwtPayload;
      expect(decoded.sub).toBe('unit-usr-999');
    });

    it('should throw UnauthorizedError with INVALID_CREDENTIALS for wrong password in unit call', async () => {
      const passwordHash = await bcrypt.hash('CorrectPass123', 10);
      const mockRepo = {
        findByEmail: async () => ({
          id: 'unit-usr-999',
          name: 'Unit Tester',
          email: 'unit@opsflow.io',
          passwordHash,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
        findById: async () => null,
        create: async () => {
          throw new Error('Not implemented');
        },
      };

      const service = new AuthService(mockRepo);
      await expect(
        service.login({
          email: 'unit@opsflow.io',
          password: 'IncorrectPassword',
        })
      ).rejects.toThrow('Invalid email or password.');
    });
  });
});
