import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../app.js';

describe('products endpoints', () => {
  it('lists products with pagination', async () => {
    const response = await request(app).get('/api/v1/products?page=1&limit=5');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
