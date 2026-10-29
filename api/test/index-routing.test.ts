import { beforeEach, describe, expect, it, vi } from 'vitest';

const consolidatedHandler = vi.hoisted(() => vi.fn(async (req: any, res: any) => {
  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, action: req.query?.action, id: req.query?.id }));
}));

vi.mock('../orders/[id].ts', () => ({ default: consolidatedHandler }));

import { resolveRoute } from '../index.js';

function makeResponse() {
  return {
    statusCode: 200,
    body: '',
    setHeader: vi.fn(),
    end(body: string) { this.body = body; },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('API action routing', () => {
  it('routes requote to the consolidated order handler with action and id', async () => {
    const req = { method: 'POST', url: '/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/requote' } as any;
    const res = makeResponse();

    await resolveRoute(req, res);

    expect(consolidatedHandler).toHaveBeenCalledTimes(1);
    expect(consolidatedHandler.mock.calls[0][0].query).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'requote',
    });
    expect(res.statusCode).toBe(200);
  });

  it('routes POST payment-session to the consolidated order handler with action and id', async () => {
    const req = { method: 'POST', url: '/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/payment-session' } as any;
    const res = makeResponse();

    await resolveRoute(req, res);

    expect(consolidatedHandler).toHaveBeenCalledTimes(1);
    expect(consolidatedHandler.mock.calls[0][0].query).toMatchObject({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      action: 'payment-session',
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects a non-POST payment-session without invoking the handler', async () => {
    const req = { method: 'GET', url: '/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/payment-session' } as any;
    const res = makeResponse();

    await resolveRoute(req, res);

    expect(consolidatedHandler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(405);
    expect(res.body).toContain('Método no permitido');
  });

  it('rejects an unknown API route', async () => {
    const req = { method: 'POST', url: '/api/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/unknown' } as any;
    const res = makeResponse();

    await resolveRoute(req, res);

    expect(consolidatedHandler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.body).toContain('Route not found');
  });
});