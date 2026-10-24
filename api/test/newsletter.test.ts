import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../newsletter.js';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}));

describe('newsletter endpoint', () => {
  const insert = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supabaseAdmin!.from).mockReturnValue({ insert } as never);
    insert.mockResolvedValue({ error: null });
  });

  function createResponse() {
    return {
      statusCode: 0,
      headers: {} as Record<string, string>,
      body: '',
      setHeader(name: string, value: string) {
        this.headers[name] = value;
      },
      end(body: string) {
        this.body = body;
      },
    };
  }

  async function submitNewsletter(email: string) {
    const request = new EventEmitter() as EventEmitter & { method: string };
    request.method = 'POST';
    const response = createResponse();
    const result = handler(request, response);
    request.emit('data', JSON.stringify({ email, source: 'home' }));
    request.emit('end');
    await result;
    return response;
  }

  it('persists a validated signup through the server admin client', async () => {
    const response = await submitNewsletter('client@example.test');

    expect(supabaseAdmin!.from).toHaveBeenCalledWith('newsletter_subscribers');
    expect(insert).toHaveBeenCalledWith({
      email: 'client@example.test',
      source: 'home',
      status: 'ACTIVE',
    });
    expect(response.statusCode).toBe(201);
  });

  it('returns 409 when the database reports a duplicate email', async () => {
    insert.mockResolvedValueOnce({
      error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    });

    const response = await submitNewsletter('client@example.test');

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.message).toBe('Este correo ya está suscrito.');
  });

  it('returns a generic 500 for other database errors', async () => {
    insert.mockResolvedValueOnce({
      error: { code: 'XX000', message: 'internal database detail' },
    });

    const response = await submitNewsletter('client@example.test');

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body).error.message).toBe('No fue posible completar la suscripción.');
    expect(response.body).not.toContain('internal database detail');
  });
});
