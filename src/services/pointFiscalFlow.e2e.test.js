// Point simulado -> pago aprobado -> venta única -> boleta DTE 39 (simulada) ->
// Walinka Print Connector (falso, con idempotencia), y recuperación sin duplicar
// pagos, ventas, boletas ni folios. Sin red real.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

const { createPointSimulator, POINT_SIM_TERMINAL_ID } = await import('./pointSimulator');
const { createPointClient, resolvePointMode } = await import('./pointClient');
const { createFiscalSaleFlow, createFlowMarks, PHASE } = await import('./fiscalSaleFlow');
const { createSimulatedEmitter } = await import('./fiscalEmitters');
const { printIssuedBoleta } = await import('./fiscalThermalPrintService');
const { savePendingFiscalSale, listPendingFiscalSales, clearPendingFiscalSale, SETTLED_PHASES } = await import('./fiscalPendingSales');
const { buildConnectorConfigKey, writeConnectorConfig } = await import('../lib/printing/connectorConfigStorage');

const BIZ = 'biz-point-1';
const cart = [{ product_id: 'p1', name: 'Café', unit_price: 1500, quantity: 2 }];

function fakeConnector({ failFirst = false } = {}) {
  const jobs = new Map();
  const printed = [];
  let fail = failFirst;
  const fetchImpl = vi.fn(async (url, init) => {
    const reply = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) });
    if (!String(url).endsWith('/v1/print')) return reply(404, { error: 'not_found' });
    const body = JSON.parse(init.body);
    if (jobs.get(body.idempotencyKey) === 'printed') return reply(200, { status: 'printed', duplicate: true });
    if (fail) { fail = false; jobs.set(body.idempotencyKey, 'failed'); return reply(503, { error: 'printer_unavailable', problems: ['sin papel'] }); }
    jobs.set(body.idempotencyKey, 'printed');
    printed.push({ key: body.idempotencyKey });
    return reply(200, { status: 'printed', duplicate: false });
  });
  return { fetchImpl, printed };
}

function setup({ scenario = 'approved', connector = fakeConnector() } = {}) {
  globalThis.fetch = connector.fetchImpl;
  const sim = createPointSimulator({ businessId: BIZ, storage: localStorage, scenario: () => scenario });
  const point = createPointClient('simulated', { simulator: sim });
  const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => 'ok' });
  const flow = createFiscalSaleFlow({
    businessId: BIZ, emitter, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }),
    print: ({ bytes, reprint, idempotencyKey, saleNumber }) => printIssuedBoleta({ businessId: BIZ, bytes, reprint, idempotencyKey, saleNumber }),
  });
  return { sim, point, emitter, flow, connector };
}

// Igual que el TPV: consulta hasta que hay venta o estado terminal.
async function pollUntilDone(point, operationId, max = 10) {
  const seen = [];
  for (let i = 0; i < max; i++) {
    const r = await point.getPointOrder(operationId);
    seen.push(r);
    if (r.data?.invoice_id || ['failed', 'expired', 'canceled'].includes(r.data?.status)) return { last: r, seen };
  }
  return { last: seen.at(-1), seen };
}

// Igual que finishPointUi del TPV.
function saleContextFor(sale) {
  const total = cart.reduce((a, it) => a + it.unit_price * it.quantity, 0);
  return { items: cart, payments: [{ method: 'mercado_pago', amount: total }], total, discountAmount: 0, pendingBalance: 0, saleNumber: sale.invoice_number };
}

async function charge(point, keys = { create: 'c-1', sale: 's-1' }) {
  return point.createPointOrder({ terminalId: POINT_SIM_TERMINAL_ID, items: cart, createIdempotencyKey: keys.create, saleIdempotencyKey: keys.sale });
}

beforeEach(() => {
  localStorage.clear();
  writeConnectorConfig(buildConnectorConfigKey(BIZ), {
    enabled: true, token: 't'.repeat(40), baseUrl: 'http://127.0.0.1:17777', printerName: 'XP-80C',
  });
});

describe('Point simulado solo en Preview', () => {
  it('nunca se activa en producción', () => {
    expect(resolvePointMode({}, 'go.walinka.com')).toBe('live');
    expect(resolvePointMode({ VITE_POINT_MODE: 'simulated' }, 'go.walinka.com')).toBe('live');
    expect(resolvePointMode({}, 'saas-git-claude-project-thread-x9ut7z-juan-s-projects-afd7e18e.vercel.app')).toBe('simulated');
    expect(resolvePointMode({ VITE_POINT_MODE: 'live' }, 'saas-git-rama-juan-s-projects-afd7e18e.vercel.app')).toBe('live');
    // URL del deployment de una Preview: decide el entorno de compilación.
    expect(resolvePointMode({ VITE_VERCEL_ENV: 'preview' }, 'saas-7fhdnp8ph-juan-s-projects-afd7e18e.vercel.app')).toBe('simulated');
    expect(resolvePointMode({ VITE_VERCEL_ENV: 'production' }, 'saas-git-rama-juan-s-projects-afd7e18e.vercel.app')).toBe('live');
  });

  it('expone una terminal PDV verificada, sin cuenta real', async () => {
    const { point } = setup();
    expect((await point.getPointTerminals()).data.terminals[0]).toMatchObject({ id: POINT_SIM_TERMINAL_ID, operating_mode: 'PDV' });
    expect((await point.getPointTerminalPreference()).data.preference.verification_status).toBe('verified');
  });
});

describe('Point aprobado -> una boleta impresa', () => {
  it('envía el importe, al aprobar crea una sola venta y emite e imprime una boleta', async () => {
    const { sim, point, flow, emitter, connector } = setup();
    const created = await charge(point);
    expect(created.data).toMatchObject({ status: 'at_terminal', amount: 3000 });
    const { last, seen } = await pollUntilDone(point, created.data.operation_id);
    expect(seen[0].data.status).toBe('at_terminal');
    expect(last.data).toMatchObject({ status: 'processed', payment_status: 'approved', finalized: true });
    const sale = last.data.sale;
    expect(sale).toMatchObject({ simulated: true, invoice_number: 'SIM-0001' });

    const r = await flow.start(sale.id, saleContextFor(sale));
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(emitter.providerCalls).toBe(1);
    expect(connector.printed).toEqual([{ key: `fiscal:${BIZ}:900001:boleta` }]);
    expect(sim.charges).toBe(1);
  });

  it('reintentar el cobro con las mismas claves no crea otro pago', async () => {
    const { sim, point } = setup();
    const a = await charge(point);
    const b = await charge(point);
    expect(b.data.operation_id).toBe(a.data.operation_id);
    expect(sim.charges).toBe(1);
  });

  it('consultas repetidas tras aprobar devuelven la misma venta', async () => {
    const { point } = setup();
    const created = await charge(point);
    const first = (await pollUntilDone(point, created.data.operation_id)).last.data.invoice_id;
    const again = await point.getPointOrder(created.data.operation_id);
    expect(again.data.invoice_id).toBe(first);
    expect(again.data.sale.invoice_number).toBe('SIM-0001');
  });

  it('venta que tarda en registrarse: espera sin habilitar otro cobro y termina en una venta', async () => {
    const { point } = setup({ scenario: 'finalization_pending' });
    const created = await charge(point);
    const { last, seen } = await pollUntilDone(point, created.data.operation_id);
    expect(seen.some((r) => r.error?.reason === 'POINT_FINALIZATION_PENDING')).toBe(true);
    expect(last.data.invoice_id).toBeTruthy();
  });

  it.each([['rejected', 'failed'], ['expired', 'expired']])('pago %s: sin venta ni boleta', async (scenario, status) => {
    const { point, emitter } = setup({ scenario });
    const created = await charge(point);
    const { last } = await pollUntilDone(point, created.data.operation_id);
    expect(last.data).toMatchObject({ status, invoice_id: null, sale: null });
    expect(emitter.providerCalls).toBe(0);
  });

  it('cancelar en la terminal antes de pagar no crea venta', async () => {
    const { point } = setup();
    const created = await charge(point);
    const c = await point.cancelPointOrder(created.data.operation_id);
    expect(c.data.status).toBe('canceled');
    expect((await point.getPointOrder(created.data.operation_id)).data.invoice_id).toBeNull();
  });
});

describe('recuperación sin duplicar', () => {
  it('impresión fallida: reintentar usa la misma clave y no emite otra boleta', async () => {
    const connector = fakeConnector({ failFirst: true });
    const { point, flow, emitter } = setup({ connector });
    const created = await charge(point);
    const sale = (await pollUntilDone(point, created.data.operation_id)).last.data.sale;
    const r1 = await flow.start(sale.id, saleContextFor(sale));
    expect(r1).toMatchObject({ phase: PHASE.PRINT_FAILED, folio: 900001 });
    const r2 = await flow.retryPrint(sale.id, r1.folio);
    expect(r2).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(emitter.providerCalls).toBe(1);
    expect(connector.printed).toEqual([{ key: `fiscal:${BIZ}:900001:boleta` }]);
  });

  it('TPV recargado tras imprimir: reabrir la venta no emite ni imprime de nuevo', async () => {
    const { point, flow, emitter, connector } = setup();
    const created = await charge(point);
    const sale = (await pollUntilDone(point, created.data.operation_id)).last.data.sale;
    await flow.start(sale.id, saleContextFor(sale));
    // "Recarga": flujo nuevo con el mismo almacenamiento.
    const reopened = setup({ connector });
    const r = await reopened.flow.start(sale.id, saleContextFor(sale));
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001, alreadyPrinted: true });
    expect(emitter.providerCalls + reopened.emitter.providerCalls).toBe(1);
    expect(connector.printed).toHaveLength(1);
  });

  it('TPV cerrado con la boleta emitida sin imprimir: «Recuperar» imprime el mismo folio', async () => {
    const connector = fakeConnector({ failFirst: true });
    const { point, flow } = setup({ connector });
    const created = await charge(point);
    const sale = (await pollUntilDone(point, created.data.operation_id)).last.data.sale;
    const ticketData = { sale, ...saleContextFor(sale) };
    savePendingFiscalSale(BIZ, ticketData, { storage: localStorage });
    const r1 = await flow.start(sale.id, saleContextFor(sale));
    expect(SETTLED_PHASES.has(r1.phase)).toBe(false);
    expect(listPendingFiscalSales(BIZ, { storage: localStorage })).toHaveLength(1);

    const reopened = setup({ connector });
    const pending = listPendingFiscalSales(BIZ, { storage: localStorage })[0];
    const r2 = await reopened.flow.start(pending.saleId, saleContextFor(pending.ticketData.sale));
    expect(r2).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    clearPendingFiscalSale(BIZ, pending.saleId, { storage: localStorage });
    expect(listPendingFiscalSales(BIZ, { storage: localStorage })).toHaveLength(0);
    expect(connector.printed).toEqual([{ key: `fiscal:${BIZ}:900001:boleta` }]);
  });

  it('emisión incierta: no se reintenta sola; al conciliar se imprime el folio recuperado', async () => {
    const connector = fakeConnector();
    globalThis.fetch = connector.fetchImpl;
    const sim = createPointSimulator({ businessId: BIZ, storage: localStorage, scenario: () => 'approved' });
    const point = createPointClient('simulated', { simulator: sim });
    const emitter = createSimulatedEmitter({ businessId: BIZ, storage: localStorage, scenario: () => 'unknown' });
    const flow = createFiscalSaleFlow({
      businessId: BIZ, emitter, marks: createFlowMarks({ businessId: BIZ, storage: localStorage }),
      print: (p) => printIssuedBoleta({ businessId: BIZ, ...p }),
    });
    const created = await charge(point);
    const sale = (await pollUntilDone(point, created.data.operation_id)).last.data.sale;
    expect((await flow.start(sale.id, saleContextFor(sale))).phase).toBe(PHASE.UNCERTAIN);
    expect((await flow.start(sale.id, saleContextFor(sale))).phase).toBe(PHASE.UNCERTAIN);
    expect(emitter.providerCalls).toBe(1);
    await emitter.reconcile(sale.id);
    const r = await flow.refresh(sale.id, saleContextFor(sale));
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(emitter.providerCalls).toBe(1);
    expect(connector.printed).toHaveLength(1);
  });

  it('reimprimir desde el TPV no consume folio ni repite la clave del original', async () => {
    const { point, flow, emitter, connector } = setup();
    const created = await charge(point);
    const sale = (await pollUntilDone(point, created.data.operation_id)).last.data.sale;
    await flow.start(sale.id, saleContextFor(sale));
    const r = await flow.reprint(sale.id, 900001);
    expect(r).toMatchObject({ phase: PHASE.PRINTED, reprinted: true });
    expect(emitter.providerCalls).toBe(1);
    expect(connector.printed).toHaveLength(2);
    expect(connector.printed[1].key).not.toBe(connector.printed[0].key);
  });
});
