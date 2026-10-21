import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  operation: {} as Record<string, unknown>,
  rpc: vi.fn(),
  from: vi.fn(),
}));
vi.mock('../_shared/mpPoint.ts', () => ({
  MP_ORDERS_URL: 'https://api.mercadopago.com/v1/orders',
  MP_ALLOWED_STATUSES: new Set(['created', 'at_terminal', 'processed', 'failed', 'expired', 'canceled', 'refunded', 'action_required']),
  pointCorsHeaders: {},
  pointJson: (body: unknown, status = 200) => new Response(JSON.stringify(body), { status }),
  resolvePointContext: vi.fn(async () => ({ ok: true, admin: { from: state.from, rpc: state.rpc }, businessId: 'business-test', accessToken: 'fake-token' })),
  sanitizePointOrder: (body: Record<string, unknown>) => body,
}));

type Handler = (request: Request) => Promise<Response>;
let handler: Handler;
const operationId = '11111111-1111-4111-8111-111111111111';
const makeRequest = () => new Request('https://example.test/get-order', {
  method: 'POST', headers: { authorization: 'Bearer fake', 'content-type': 'application/json' },
  body: JSON.stringify({ operationId }),
});
const mpOrder = { id: 'remote-123', external_reference: 'wpt_reference', status: 'processed', payment_id: 'payment-123', amount: '1000' };
const chain = (result: () => unknown) => {
  const q: Record<string, unknown> = {};
  q.eq = () => q;
  q.maybeSingle = async () => result();
  return q;
};

beforeAll(async () => {
  vi.stubGlobal('Deno', { serve: (callback: Handler) => { handler = callback; } });
  await import('./index.ts');
});

beforeEach(() => {
  state.operation = { id: operationId, business_id: 'business-test', mp_order_id: 'remote-123', external_reference: 'wpt_reference', mp_status: 'created', crm_invoice_id: null, processed_at: null };
  state.rpc.mockReset();
  state.from.mockReset();
  state.from.mockImplementation((table: string) => {
    if (table === 'crm_pos_point_operations') return {
      select: () => chain(() => ({ data: state.operation, error: null })),
      update: () => ({ eq: async () => ({ error: null }) }),
    };
    if (table === 'crm_invoices') return { select: () => chain(() => ({ data: { id: 'invoice-1' }, error: null })) };
    throw new Error('Unexpected table: ' + table);
  });
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(mpOrder), { status: 200 })));
});

describe('Point get-order — processed payment recovery with mocked dependencies', () => {
  it('finalizes a confirmed payment after the browser loses connection', async () => {
    state.rpc.mockResolvedValueOnce({ data: [{ id: 'invoice-1' }], error: null });
    const response = await handler(makeRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.finalized).toBe(true);
    expect(body.invoice_id).toBe('invoice-1');
    expect(state.rpc).toHaveBeenCalledWith('crm_finalize_point_sale', { p_operation_id: operationId });
  });

  it('returns pending recovery if the database finalizer fails, without releasing stock', async () => {
    state.rpc.mockResolvedValueOnce({ data: null, error: { message: 'temporary database error' } });
    const response = await handler(makeRequest());
    expect(response.status).toBe(202);
    expect((await response.json()).reason).toBe('POINT_FINALIZATION_PENDING');
    expect(state.rpc).not.toHaveBeenCalledWith('crm_point_release_stock', expect.anything());
  });

  it('does not finalize again when the operation already has an invoice', async () => {
    state.operation.crm_invoice_id = 'invoice-1';
    const response = await handler(makeRequest());
    expect(response.status).toBe(200);
    expect((await response.json()).invoice_id).toBe('invoice-1');
    expect(state.rpc).not.toHaveBeenCalledWith('crm_finalize_point_sale', expect.anything());
  });

  it('rejects a remote order with a mismatched reference without finalizing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...mpOrder, external_reference: 'other-sale' }), { status: 200 })));
    const response = await handler(makeRequest());
    expect(response.status).toBe(409);
    expect((await response.json()).reason).toBe('MP_ORDER_MISMATCH');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it('defers recovery if Mercado Pago cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network disconnected'); }));
    const response = await handler(makeRequest());
    expect(response.status).toBe(502);
    expect((await response.json()).reason).toBe('MP_GET_UNAVAILABLE');
    expect(state.rpc).not.toHaveBeenCalled();
  });
});
