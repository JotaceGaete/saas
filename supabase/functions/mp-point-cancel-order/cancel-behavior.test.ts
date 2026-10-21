import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  admin: { from: vi.fn(), rpc: vi.fn() },
  operation: null as Record<string, unknown> | null,
}));
vi.mock('../_shared/mpPoint.ts', () => ({
  MP_ORDERS_URL: 'https://api.mercadopago.com/v1/orders',
  MP_ALLOWED_STATUSES: new Set(['creating', 'created', 'at_terminal', 'processed', 'failed', 'expired', 'canceled', 'refunded', 'action_required']),
  pointCorsHeaders: {},
  pointJson: (data: unknown, status = 200) => new Response(JSON.stringify(data), { status }),
  resolvePointContext: vi.fn(async () => ({
    ok: true, admin: mock.admin, businessId: 'business-test', accessToken: 'fake-token',
  })),
  sanitizePointOrder: (o: Record<string, unknown>) => o,
}));

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const operationId = '11111111-1111-4111-8111-111111111111';
const baseOperation = {
  id: operationId, business_id: 'business-test', mp_status: 'creating',
  mp_order_id: null, external_reference: 'wpt_reference', cancel_idempotency_key: 'cancel-key',
};
const request = () => new Request('https://example.test/mp-point-cancel-order', {
  method: 'POST', headers: { authorization: 'Bearer fake-user', 'content-type': 'application/json' },
  body: JSON.stringify({ operationId }),
});

beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: (callback: Handler) => { handler = callback; } });
  await import('./index.ts');
});

beforeEach(() => {
  vi.restoreAllMocks();
  mock.operation = { ...baseOperation };
  mock.admin.rpc.mockReset();
  mock.admin.from.mockReset();
  mock.admin.from.mockImplementation(() => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: mock.operation, error: null }),
        }),
      }),
    }),
  }));
  vi.stubGlobal('fetch', vi.fn());
});

describe('Point cancel — behavior with mocked Mercado Pago and database', () => {
  it('refuses ambiguous creating order and never releases stock', async () => {
    const response = await handler(request());
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('MP_CREATE_UNRESOLVED');
    expect(mock.admin.rpc).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refuses a locally failed order without remote id; cannot infer remote failure', async () => {
    mock.operation = { ...baseOperation, mp_status: 'failed' };
    const response = await handler(request());
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('MP_CREATE_UNRESOLVED');
    expect(mock.admin.rpc).not.toHaveBeenCalled();
  });

  it('does not release stock when authoritative Mercado Pago lookup is unavailable', async () => {
    mock.operation = { ...baseOperation, mp_order_id: 'remote-123', mp_status: 'created' };
    vi.mocked(fetch).mockRejectedValueOnce(new Error('connection lost'));
    const response = await handler(request());
    expect(response.status).toBe(502);
    expect((await response.json()).reason).toBe('MP_GET_FAILED');
    expect(mock.admin.rpc).not.toHaveBeenCalled();
  });

  it('does not cancel or release a remotely processed payment', async () => {
    mock.operation = { ...baseOperation, mp_order_id: 'remote-123', mp_status: 'created' };
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'remote-123', external_reference: 'wpt_reference', status: 'processed',
    }), { status: 200 }));
    mock.admin.from.mockImplementation(() => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mock.operation, error: null }) }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }));
    const response = await handler(request());
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('ORDER_NOT_CANCELABLE');
    expect(mock.admin.rpc).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
