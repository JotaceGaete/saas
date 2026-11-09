// Point REAL + boleta SIMULADA en Preview: los dos modos son independientes.
// El cobro va a la integración real de Mercado Pago Point (aquí, una API falsa
// con la misma forma); la boleta nunca llega a DTE Core ni al SII.
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) }, auth: { getSession: vi.fn() }, from: vi.fn() } }));

const {
  createPointClient, createPreviewPointDemo, resolvePointMode, PREVIEW_POINT_DEMO_KEY, PREVIEW_REAL_POINT_MAX_AMOUNT, PREVIEW_POINT_DEMO_TTL_MS,
} = await import('./pointClient');
const { default: TpvFiscalAutoBoleta, fiscalModeForSale, previewLiveDecision, PREVIEW_LIVE } = await import('../pages/crm/components/TpvFiscalAutoBoleta');
const { buildConnectorConfigKey, writeConnectorConfig } = await import('../lib/printing/connectorConfigStorage');

const PREVIEW_HOST = 'saas-git-claude-project-thread-x9ut7z-juan-s-projects-afd7e18e.vercel.app';
const BIZ = '85e80cd0-7242-492f-951d-b17893e84283';

function fakeLiveApi() {
  const calls = [];
  const api = new Proxy({}, {
    get: (_, name) => async (...args) => { calls.push({ name, args }); return { data: { ok: true, live: true, name }, error: null }; },
  });
  return { api, calls };
}

beforeEach(() => { localStorage.clear(); invoke.mockReset(); });
afterEach(() => cleanup());

describe('modo Point', () => {
  it('Preview: Point REAL por defecto, simulada solo en modo DEMO; producción siempre real', () => {
    expect(resolvePointMode({}, PREVIEW_HOST)).toBe('live');
    expect(resolvePointMode({ VITE_VERCEL_ENV: 'preview' }, 'saas-abc123-juan-s-projects-afd7e18e.vercel.app')).toBe('live');
    expect(resolvePointMode({}, PREVIEW_HOST, { demoOptIn: true })).toBe('simulated');
    expect(resolvePointMode({ VITE_VERCEL_ENV: 'production' }, 'go.walinka.com')).toBe('live');
    expect(resolvePointMode({ VITE_VERCEL_ENV: 'production' }, 'go.walinka.com', { demoOptIn: true })).toBe('live');
  });

  it('el modo DEMO caduca solo, se renueva con el uso y borra la opción antigua', () => {
    localStorage.setItem('walinka:point-preview-real', '{"enabledAt":1}');
    let t = 1_000_000;
    const opt = createPreviewPointDemo({ storage: localStorage, now: () => t });
    expect(localStorage.getItem('walinka:point-preview-real')).toBeNull();
    expect(opt.get()).toBeNull();
    opt.enable();
    expect(opt.get()).not.toBeNull();
    t += PREVIEW_POINT_DEMO_TTL_MS - 1;
    opt.touch();
    t += PREVIEW_POINT_DEMO_TTL_MS - 1;
    expect(opt.get()).not.toBeNull();
    t += 2;
    expect(opt.get()).toBeNull();
    opt.enable();
    opt.disable();
    expect(localStorage.getItem(PREVIEW_POINT_DEMO_KEY)).toBeNull();
  });

  it('con Point real activo, el cobro va a la integración real de Mercado Pago', async () => {
    const { api, calls } = fakeLiveApi();
    let mode = 'simulated';
    const client = createPointClient(() => mode, { liveApi: api, previewLimit: () => mode === 'live' });
    const sim = await client.getPointTerminals();
    expect(sim.data.terminals[0].simulated).toBe(true);
    expect(calls).toHaveLength(0);

    mode = 'live';
    const items = [{ product_id: 'p1', name: 'Prueba', unit_price: 500, quantity: 2 }];
    const r = await client.createPointOrder({ terminalId: 'T-REAL', items, createIdempotencyKey: 'c', saleIdempotencyKey: 's' });
    expect(r.data).toMatchObject({ live: true, name: 'createPointOrder' });
    expect(calls.map((c) => c.name)).toEqual(['createPointOrder']);
    expect(calls[0].args[0]).toMatchObject({ terminalId: 'T-REAL', items });
  });

  it(`Point real en Preview no envía cobros sobre $${PREVIEW_REAL_POINT_MAX_AMOUNT} a la terminal`, async () => {
    const { api, calls } = fakeLiveApi();
    const client = createPointClient('live', { liveApi: api, previewLimit: true });
    const r = await client.createPointOrder({
      terminalId: 'T', items: [{ name: 'X', unit_price: 1001, quantity: 1 }], createIdempotencyKey: 'c', saleIdempotencyKey: 's',
    });
    expect(r.error.reason).toBe('PREVIEW_REAL_POINT_LIMIT');
    expect(calls).toHaveLength(0);
    // En producción no hay límite (previewLimit false).
    const prod = createPointClient('live', { liveApi: api, previewLimit: false });
    await prod.createPointOrder({ terminalId: 'T', items: [{ name: 'X', unit_price: 50000, quantity: 1 }], createIdempotencyKey: 'c2', saleIdempotencyKey: 's2' });
    expect(calls).toHaveLength(1);
  });
});

describe('boleta con Point real en Preview', () => {
  it('en una Preview el modo real queda pendiente del servidor; una venta simulada nunca es real', () => {
    expect(fiscalModeForSale('live', { id: 'x' }, { preview: true })).toBe(PREVIEW_LIVE);
    expect(fiscalModeForSale('live', { id: 'x', simulated: true }, { preview: false })).toBe('simulated');
    expect(fiscalModeForSale('simulated', { id: 'x' }, { preview: true })).toBe('simulated');
    expect(fiscalModeForSale('off', { id: 'x' }, { preview: true })).toBe('off');
    expect(fiscalModeForSale('live', { id: 'x' }, { preview: false })).toBe('live');
  });

  it('el modo real en Preview solo con liveAuthorized === true del servidor; cualquier otra respuesta = simulada', () => {
    expect(previewLiveDecision({ ok: true, data: { liveAuthorized: true } })).toBe('live');
    for (const r of [
      { ok: true, data: { liveAuthorized: false } }, { ok: true, data: { liveAuthorized: 'true' } }, { ok: true, data: {} },
      { ok: false, code: 'STATUS_UNAVAILABLE' }, { ok: false, data: { liveAuthorized: true } }, null, undefined,
    ]) expect(previewLiveDecision(r)).toBe('simulated');
  });

  it('venta pagada con Point real: boleta SIMULADA impresa sola, sin emitir en DTE Core (fiscal-emit)', async () => {
    writeConnectorConfig(buildConnectorConfigKey(BIZ), {
      enabled: true, token: 't'.repeat(40), baseUrl: 'http://127.0.0.1:47801', printerName: 'Star TSP100 Cutter (TSP143)',
    });
    const jobs = [];
    globalThis.fetch = vi.fn(async (url, init) => {
      if (!String(url).endsWith('/v1/print')) return { ok: false, status: 404, json: async () => ({}) };
      const body = JSON.parse(init.body);
      jobs.push({ key: body.idempotencyKey, text: atob(body.dataBase64) });
      return { ok: true, status: 200, json: async () => ({ status: 'sent_to_spooler', duplicate: false }) };
    });
    const ctx = {
      items: [{ product_id: 'p1', name: 'Prueba', unit_price: 500, quantity: 2 }],
      payments: [{ method: 'mercado_pago', amount: 1000 }], total: 1000, discountAmount: 0, pendingBalance: 0, saleNumber: 60,
    };
    // mode="live" a propósito: en una Preview (jsdom = localhost) la boleta queda simulada igual.
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'real-point-sale', invoice_number: 60 }} saleContext={ctx} mode="live" />);
    await screen.findByText(/Boleta 900001 emitida y enviada a la impresora/);
    expect(screen.getByText(/SIMULACIÓN \(sin valor tributario\)/)).toBeInTheDocument();
    // En Preview se pregunta al servidor si autoriza el modo real (solo lectura). Aquí no responde:
    // la boleta queda simulada y nunca se pide una emisión.
    expect(invoke.mock.calls.every(([fn, opts]) => fn === 'fiscal-emit' && opts.body.action === 'status')).toBe(true);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].text).toContain('SIMULACION');
    expect(jobs[0].text).toContain('SIN VALOR TRIBUTARIO');
  });
});

describe('modo real en Preview autorizado por el servidor', () => {
  const ctx = {
    items: [{ product_id: 'p1', name: 'Prueba', unit_price: 1190, quantity: 1 }],
    payments: [{ method: 'cash', amount: 1190 }], total: 1190, discountAmount: 0, pendingBalance: 0, saleNumber: 61,
  };

  it('con liveAuthorized del servidor usa el emisor real (sin SIMULACIÓN); el servidor sigue decidiendo cada emisión', async () => {
    // El servidor autoriza el modo real, pero la emisión está apagada: el panel no muestra boleta
    // y se imprime el comprobante interno. Nunca se pide 'emit'.
    invoke.mockResolvedValue({ data: { state: 'none', canEmit: false, blockedReason: 'FISCAL_EMISSION_DISABLED', liveAuthorized: true }, error: null });
    const onPlainTicket = vi.fn();
    const previewStatus = vi.fn(async () => ({ ok: true, data: { liveAuthorized: true } }));
    render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'sale-live-1' }} saleContext={ctx} mode="live" preview previewStatus={previewStatus} onPlainTicket={onPlainTicket} />);
    await vi.waitFor(() => expect(onPlainTicket).toHaveBeenCalledTimes(1));
    expect(previewStatus).toHaveBeenCalledWith('sale-live-1');
    expect(invoke).toHaveBeenCalledWith('fiscal-emit', expect.objectContaining({ body: { action: 'status', saleId: 'sale-live-1' } }));
    expect(invoke.mock.calls.some(([, o]) => o.body.action === 'emit')).toBe(false);
    expect(screen.queryByText(/SIMULACIÓN/)).toBeNull();
  });

  it('sin autorización o con error del servidor: boleta simulada, sin llamar al emisor real', async () => {
    writeConnectorConfig(buildConnectorConfigKey(BIZ), {
      enabled: true, token: 't'.repeat(40), baseUrl: 'http://127.0.0.1:47801', printerName: 'Star TSP100 Cutter (TSP143)',
    });
    globalThis.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: 'sent_to_spooler', duplicate: false }) }));
    for (const [i, previewStatus] of [
      async () => ({ ok: true, data: { liveAuthorized: false } }),
      async () => { throw new Error('caído'); },
    ].entries()) {
      cleanup();
      render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: `sale-sim-${i}` }} saleContext={ctx} mode="live" preview previewStatus={previewStatus} />);
      expect(await screen.findByText(/SIMULACIÓN \(sin valor tributario\)/)).toBeInTheDocument();
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it('fuera de Preview el modo real no pregunta nada extra', async () => {
    invoke.mockResolvedValue({ data: { state: 'none', canEmit: false, blockedReason: 'FISCAL_BUSINESS_NOT_ALLOWED', liveAuthorized: false }, error: null });
    const previewStatus = vi.fn();
    const onPlainTicket = vi.fn();
    const { container } = render(<TpvFiscalAutoBoleta businessId={BIZ} sale={{ id: 'sale-prod-1' }} saleContext={ctx} mode="live" preview={false} previewStatus={previewStatus} onPlainTicket={onPlainTicket} />);
    await vi.waitFor(() => expect(onPlainTicket).toHaveBeenCalledTimes(1));
    expect(previewStatus).not.toHaveBeenCalled();
    // Negocio fuera de la lista: el módulo no se muestra y se imprime el comprobante interno.
    expect(container.querySelector('[data-testid="fiscal-auto-boleta"]')).toBeNull();
  });
});
