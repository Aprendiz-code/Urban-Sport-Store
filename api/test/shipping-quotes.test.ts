import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  authenticate: vi.fn(),
  requireActiveProfile: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: apiMocks.from },
}));
vi.mock('../../lib/api-helpers/auth.js', () => ({
  requireAuthenticatedUser: apiMocks.authenticate,
}));
vi.mock('../../lib/api-helpers/admin.js', () => ({
  requireActiveProfile: apiMocks.requireActiveProfile,
}));

import handler from '../shipping/quotes.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

describe('shipping quote endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'customer-user' });
    apiMocks.requireActiveProfile.mockResolvedValue(undefined);
  });

  it('does not quote or query rates until a shipping provider is configured', async () => {
    const response = createResponse();

    await handler({ method: 'POST', body: {} }, response);

    expect(response.statusCode).toBe(503);
    expect(JSON.parse(response.body).error.message).toContain('no está configurado');
    expect(apiMocks.from).not.toHaveBeenCalled();
  });
});