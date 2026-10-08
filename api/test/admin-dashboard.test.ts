import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: apiMocks.from },
}));
vi.mock('../../lib/api-helpers/auth.js', () => ({
  requireAuthenticatedUser: apiMocks.authenticate,
}));
vi.mock('../../lib/api-helpers/admin.js', () => ({
  requirePermission: apiMocks.requirePermission,
}));

import handler from '../admin/dashboard.js';
import { ApiError } from '../../lib/api-helpers/response.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

function createQuery(result: unknown) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    not: vi.fn(() => query),
    gte: vi.fn(() => query),
    lte: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    range: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  };
  return query;
}

describe('admin dashboard endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
  });

  it('returns explicit empty states when Supabase queries succeed with no rows', async () => {
    apiMocks.from.mockImplementation((_table: string) => createQuery({
      data: null,
      count: 0,
      error: null,
    }));
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/admin/dashboard' }, response);

    const data = JSON.parse(response.body).data;
    expect(response.statusCode).toBe(200);
    expect(data.orders).toEqual({ status: 'empty', total: 0, recent: [] });
    expect(data.customers).toEqual({ status: 'empty', total: 0 });
    expect(data.sales.status).toBe('empty');
    expect(data.sales.paid_orders).toBe(0);
    expect(data.sales.total_7d).toBe(0);
    expect(data.category_sales_status).toBe('empty');
  });

  it('returns recent orders with item counts and includes customer names only with customers.read', async () => {
    apiMocks.requirePermission.mockImplementation(async (_user: unknown, permission: string) => {
      if (permission === 'customers.read') throw new ApiError(403, 'No autorizado.');
      return 'ADMIN';
    });
    const ordersQuery = createQuery({
      data: [{
        id: 'order-1',
        order_number: 'USS-001',
        customer_name: 'Private Name',
        status: 'delivered',
        payment_status: 'paid',
        total: 50000,
        created_at: '2026-10-01T12:00:00.000Z',
        order_items: [{ count: 2 }],
      }],
      count: 1,
      error: null,
    });
    const profilesQuery = createQuery({ data: null, count: 0, error: null });
    apiMocks.from.mockImplementation((table: string) => table === 'orders' ? ordersQuery : profilesQuery);
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/admin/dashboard' }, response);

    const data = JSON.parse(response.body).data;
    expect(data.orders).toEqual({
      status: 'ready',
      total: 1,
      recent: [{
        id: 'order-1',
        order_number: 'USS-001',
        status: 'delivered',
        payment_status: 'paid',
        total: 50000,
        created_at: '2026-10-01T12:00:00.000Z',
        item_count: 2,
      }],
    });
    expect(ordersQuery.select.mock.calls[0][0]).not.toContain('customer_name');
    expect(JSON.stringify(data)).not.toContain('Private Name');
    expect(data.customers.status).toBe('forbidden');
    expect(data.sales.status).toBe('ready');
    expect(data.sales.paid_orders).toBe(1);
    expect(data.sales.total_7d).toBe(50000);
    expect(data.category_sales_status).toBe('pending');
  });

  it('does not query dashboard data without authentication', async () => {
    apiMocks.authenticate.mockRejectedValueOnce(new ApiError(401, 'Authentication required.'));
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/admin/dashboard' }, response);

    expect(response.statusCode).toBe(401);
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('returns an explicit error state instead of zero when an orders query fails', async () => {
    apiMocks.from.mockImplementation((table: string) => createQuery(table === 'orders'
      ? { data: null, count: null, error: { code: '42501', message: 'internal detail' } }
      : { data: null, count: 0, error: null }));
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/admin/dashboard' }, response);

    const data = JSON.parse(response.body).data;
    expect(data.orders).toEqual({ status: 'error', total: null, recent: [] });
    expect(data.sales).toMatchObject({ status: 'error', paid_orders: null, total_7d: null });
    expect(response.body).not.toContain('internal detail');
  });
});