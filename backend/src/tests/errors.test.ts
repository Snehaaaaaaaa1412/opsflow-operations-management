import { describe, it, expect } from 'vitest';
import {
  AppError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../utils/errors';

describe('Error Classes', () => {
  it('AppError should have correct properties', () => {
    const err = new AppError(418, 'TEAPOT', 'I am a teapot');
    expect(err.statusCode).toBe(418);
    expect(err.code).toBe('TEAPOT');
    expect(err.message).toBe('I am a teapot');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
  });

  it('BadRequestError should default to 400', () => {
    const err = new BadRequestError();
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('UnauthorizedError should default to 401', () => {
    const err = new UnauthorizedError();
    expect(err.statusCode).toBe(401);
  });

  it('ForbiddenError should default to 403', () => {
    const err = new ForbiddenError();
    expect(err.statusCode).toBe(403);
  });

  it('NotFoundError should default to 404', () => {
    const err = new NotFoundError();
    expect(err.statusCode).toBe(404);
  });

  it('ConflictError should default to 409', () => {
    const err = new ConflictError();
    expect(err.statusCode).toBe(409);
  });

  it('ValidationError should include details', () => {
    const details = [{ field: 'email', message: 'Invalid email' }];
    const err = new ValidationError('Validation failed', details);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual(details);
  });
});
