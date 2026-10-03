import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Error Handling', () => {
  it('should return 404 for unknown routes', async () => {
    const response = await request(app).get('/api/nonexistent');

    expect(response.status).toBe(404);
    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toHaveProperty('code', 'NOT_FOUND');
    expect(response.body.error).toHaveProperty('message');
  });

  it('should return structured error format', async () => {
    const response = await request(app).get('/api/does-not-exist');

    expect(response.body.error).toBeDefined();
    expect(typeof response.body.error.code).toBe('string');
    expect(typeof response.body.error.message).toBe('string');
  });
});
