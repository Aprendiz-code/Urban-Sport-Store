import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app.js';

describe('auth endpoints', () => {
  it('registers a user', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({ name: 'Test', email: 'test@example.com', password: 'StrongPass123!' });
    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
  });

  it('rejects invalid credentials', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({ email: 'wrong@example.com', password: 'bad' });
    expect(response.status).toBe(401);
  });
});
