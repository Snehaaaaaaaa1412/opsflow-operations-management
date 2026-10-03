import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from '../app';

describe('Health Endpoint', () => {
  it('GET /api/health should return 200 with status ok', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/health should return JSON content type', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['content-type']).toMatch(/json/);
  });
});
