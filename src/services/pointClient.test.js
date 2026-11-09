// Point en el TPV: modo real/DEMO, límite de Preview y simulador. Sin red: la
// integración real de Mercado Pago se reemplaza por una API falsa con la misma forma.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() }, from: vi.fn() } }));

const {
  createPointClient, createPreviewPointDemo, resolvePointMode, PREVIEW_POINT_DEMO_KEY, PREVIEW_REAL_POINT_MAX_AMOUNT, PREVIEW_POINT_DEMO_TTL_MS,
} = await import('./pointClient');
const { createPointSimulator, POINT_SIM_TERMINAL_ID } = await import('./pointSimulator');
const { isPreviewLike, isPreviewDeployment } = await import('../lib/deployEnv');

const PREVIEW_HOST = 'saas-git-claude-project-thread-x9ut7z-juan-s-projects-afd7e18e.vercel.app';

function fakeLiveApi() {
  const calls = [];
  const api = new Proxy({}, {
    get: (_, name) => async (...args) => { calls.push({ name, args }); return { data: { ok: true, live: true, name }, error: null }; },
  });
  return { api, calls };
}

beforeEach(() => localStorage.clear());

describe('entorno', () => {
  it('Preview por el entorno de compilación o el alias de rama; producción nunca', () => {
    expect(isPreviewLike({}, PREVIEW_HOST)).toBe(true);
    expect(isPreviewLike({ VITE_VERCEL_ENV: 'preview' }, 'saas-abc123-juan-s-projects-afd7e18e.vercel.app')).toBe(true);
    expect(isPreviewLike({ VITE_VERCEL_ENV: 'production' }, PREVIEW_HOST)).toBe(false);
    expect(isPreviewLike({}, 'go.walinka.com')).toBe(false);
    expect(isPreviewLike({}, 'saas-git-main-juan-s-projects-afd7e18e.vercel.app')).toBe(false);
    expect(isPreviewLike({}, 'localhost')).toBe(true);
    expect(isPreviewDeployment({}, 'localhost')).toBe(false);
  });
});

describe('modo Point', () => {
  it('Preview: real por defecto, simulada solo en modo DEMO; producción siempre real', () => {
    expect(resolvePointMode({}, PREVIEW_HOST)).toBe('live');
    expect(resolvePointMode({}, PREVIEW_HOST, { demoOptIn: true })).toBe('simulated');
    expect(resolvePointMode({ VITE_VERCEL_ENV: 'production' }, 'go.walinka.com', { demoOptIn: true })).toBe('live');
    expect(resolvePointMode({}, 'go.walinka.com')).toBe('live');
  });

  it('el modo DEMO caduca solo y se renueva con el uso', () => {
    let t = 1_000_000;
    const demo = createPreviewPointDemo({ storage: localStorage, now: () => t });
    demo.enable();
    t += PREVIEW_POINT_DEMO_TTL_MS - 1;
    demo.touch();
    t += PREVIEW_POINT_DEMO_TTL_MS - 1;
    expect(demo.get()).not.toBeNull();
    t += 2;
    expect(demo.get()).toBeNull();
    demo.enable();
    demo.disable();
    expect(localStorage.getItem(PREVIEW_POINT_DEMO_KEY)).toBeNull();
  });

  it('modo real: el cobro va a la integración de Mercado Pago con el importe exacto', async () => {
    const { api, calls } = fakeLiveApi();
    const client = createPointClient('live', { liveApi: api });
    const items = [{ product_id: 'p1', name: 'Prueba', unit_price: 500, quantity: 2 }];
    await client.createPointOrder({ terminalId: 'T', items, createIdempotencyKey: 'c', saleIdempotencyKey: 's' });
    expect(calls).toEqual([{ name: 'createPointOrder', args: [expect.objectContaining({ terminalId: 'T', items })] }]);
  });

  it(`en Preview no se envían cobros sobre $${PREVIEW_REAL_POINT_MAX_AMOUNT}; en producción no hay límite`, async () => {
    const { api, calls } = fakeLiveApi();
    const preview = createPointClient('live', { liveApi: api, previewLimit: true });
    const r = await preview.createPointOrder({ terminalId: 'T', items: [{ name: 'X', unit_price: 1001, quantity: 1 }], createIdempotencyKey: 'c', saleIdempotencyKey: 's' });
    expect(r.error.reason).toBe('PREVIEW_REAL_POINT_LIMIT');
    expect(calls).toHaveLength(0);
    await createPointClient('live', { liveApi: api }).createPointOrder({ terminalId: 'T', items: [{ name: 'X', unit_price: 50000, quantity: 1 }], createIdempotencyKey: 'c2', saleIdempotencyKey: 's2' });
    expect(calls).toHaveLength(1);
  });

  it('modo DEMO: usa el simulador y nunca la integración real', async () => {
    const { api, calls } = fakeLiveApi();
    const client = createPointClient('simulated', { liveApi: api, simulator: createPointSimulator({ businessId: 'b', storage: localStorage }) });
    expect((await client.getPointTerminals()).data.terminals[0].id).toBe(POINT_SIM_TERMINAL_ID);
    expect(calls).toHaveLength(0);
  });
});

describe('simulador Point', () => {
  const cart = [{ product_id: 'p1', name: 'Café', unit_price: 1500, quantity: 2 }];
  const charge = (sim, key = 'c-1') => sim.createPointOrder({ terminalId: POINT_SIM_TERMINAL_ID, items: cart, createIdempotencyKey: key, saleIdempotencyKey: `s-${key}` });
  async function settle(sim, id) {
    for (let i = 0; i < 10; i++) {
      const r = await sim.getPointOrder(id);
      if (r.data?.invoice_id || ['failed', 'expired', 'canceled'].includes(r.data?.status)) return r;
    }
    return null;
  }

  it('aprobado: una sola venta, aunque se reintente el cobro o se consulte varias veces', async () => {
    const sim = createPointSimulator({ businessId: 'b', storage: localStorage, scenario: () => 'approved' });
    const a = await charge(sim);
    const b = await charge(sim);
    expect(b.data.operation_id).toBe(a.data.operation_id);
    expect(sim.charges).toBe(1);
    const done = await settle(sim, a.data.operation_id);
    expect(done.data).toMatchObject({ status: 'processed', amount: 3000, finalized: true });
    const again = await sim.getPointOrder(a.data.operation_id);
    expect(again.data.invoice_id).toBe(done.data.invoice_id);
  });

  it.each([['rejected', 'failed'], ['expired', 'expired']])('%s: sin venta', async (scenario, status) => {
    const sim = createPointSimulator({ businessId: 'b', storage: localStorage, scenario: () => scenario });
    const a = await charge(sim);
    expect((await settle(sim, a.data.operation_id)).data).toMatchObject({ status, invoice_id: null });
  });
});
