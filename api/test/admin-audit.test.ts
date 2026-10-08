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

import handler from '../admin/audit.js';
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

describe('admin audit endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
  });

  it('requires audit.read and returns only fields needed by the activity view', async () => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({
        data: [{ id: 'audit-1', actor_id: 'admin-user', action: 'create_product', entity: 'product', entity_id: 'product-1', created_at: '2026-10-01T12:00:00.000Z' }],
        error: null,
      }),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    apiMocks.from.mockReturnValue(query);
    const response = createResponse();

    await handler({ method: 'GET' }, response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'audit.read');
    expect(query.select).toHaveBeenCalledWith('id, actor_id, action, entity, entity_id, created_at');
    expect(query.limit).toHaveBeenCalledWith(200);
    expect(JSON.parse(response.body).data).toHaveLength(1);
    expect(response.statusCode).toBe(200);
  });

  it('does not query audit data without authentication or permission', async () => {
    apiMocks.authenticate.mockRejectedValueOnce(new ApiError(401, 'No autenticado.'));
    const unauthenticated = createResponse();
    await handler({ method: 'GET' }, unauthenticated);
    expect(unauthenticated.statusCode).toBe(401);
    expect(apiMocks.from).not.toHaveBeenCalled();

    apiMocks.authenticate.mockResolvedValueOnce({ id: 'customer-user' });
    apiMocks.requirePermission.mockRejectedValueOnce(new ApiError(403, 'No autorizado.'));
    const forbidden = createResponse();
    await handler({ method: 'GET' }, forbidden);
    expect(forbidden.statusCode).toBe(403);
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('returns a generic error instead of database details', async () => {
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      limit: vi.fn().mockResolvedValue({ data: null, error: { code: '42501', message: 'private database detail' } }),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    apiMocks.from.mockReturnValue(query);
    const response = createResponse();

    await handler({ method: 'GET' }, response);

    expect(response.statusCode).toBe(500);
    expect(response.body).toContain('No fue posible cargar la actividad administrativa.');
    expect(response.body).not.toContain('private database detail');
  });
});