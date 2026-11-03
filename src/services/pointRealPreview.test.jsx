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
const { default: TpvFiscalAutoBoleta, fiscalModeForSale } = await import('../pages/crm/components/TpvFiscalAutoBoleta');
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
  it('en una Preview el modo fiscal nunca es real (DTE Core y SII desactivados), ni para una venta simulada', () => {
    expect(fiscalModeForSale('live', { id: 'x' }, { preview: true })).toBe('simulated');
    expect(fiscalModeForSale('live', { id: 'x', simulated: true }, { preview: false })).toBe('simulated');
    expect(fiscalModeForSale('simulated', { id: 'x' }, { preview: true })).toBe('simulated');
    expect(fiscalModeForSale('off', { id: 'x' }, { preview: true })).toBe('off');
    expect(fiscalModeForSale('live', { id: 'x' }, { preview: false })).toBe('live');
  });

  it('venta pagada con Point real: boleta SIMULADA impresa sola, sin llamar a DTE Core (fiscal-emit)', async () => {
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
    expect(invoke).not.toHaveBeenCalled();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].text).toContain('SIMULACION');
    expect(jobs[0].text).toContain('SIN VALOR TRIBUTARIO');
  });
});
