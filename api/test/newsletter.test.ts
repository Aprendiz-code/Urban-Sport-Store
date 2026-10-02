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

  it('persists a validated signup through the server admin client', async () => {
    const request = new EventEmitter() as EventEmitter & { method: string };
    request.method = 'POST';
    const response = {
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

    const result = handler(request, response);
    request.emit('data', JSON.stringify({ email: 'client@example.test', source: 'home' }));
    request.emit('end');
    await result;

    expect(supabaseAdmin!.from).toHaveBeenCalledWith('newsletter_subscribers');
    expect(insert).toHaveBeenCalledWith({
      email: 'client@example.test',
      source: 'home',
      status: 'ACTIVE',
    });
    expect(response.statusCode).toBe(201);
  });
});
