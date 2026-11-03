import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

const { createFiscalSaleFlow, createFlowMarks, originalPrintKey, PHASE } = await import('./fiscalSaleFlow');
const { createSimulatedEmitter } = await import('./fiscalEmitters');

const BIZ = 'biz-1';
const sale = { items: [{ name: 'Pan', quantity: 1, unit_price: 100 }], payments: [{ method: 'cash', amount: 100 }], total: 100, discountAmount: 0, pendingBalance: 0 };

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

function setup({ scenario = 'ok', printOk = true, storage = memStorage(), printBlocker } = {}) {
  let sc = scenario;
  const base = createSimulatedEmitter({ businessId: BIZ, storage, scenario: () => sc });
  // Copia mutable (el emisor real está congelado) para poder reemplazar métodos en las pruebas.
  const emitter = {
    mode: base.mode, status: base.status, emit: base.emit, loadDte: base.loadDte, reconcile: base.reconcile,
    get providerCalls() { return base.providerCalls; },
  };
  const print = vi.fn(async () => (typeof printOk === 'function' ? printOk() : printOk) ? { ok: true, simulation: true } : { ok: false, code: 'connector_unreachable', message: 'Conector no encontrado.' });
  const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks: createFlowMarks({ businessId: BIZ, storage }), printBlocker });
  return { emitter, flow, print, storage, setScenario: (s) => { sc = s; } };
}

describe('fiscalSaleFlow', () => {
  it('venta cobrada: emite una vez e imprime el original con clave fija por folio', async () => {
    const { flow, print, emitter } = setup();
    const r = await flow.start('s1', sale);
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(emitter.providerCalls).toBe(1);
    expect(print).toHaveBeenCalledTimes(1);
    expect(print.mock.calls[0][0]).toMatchObject({ reprint: false, idempotencyKey: originalPrintKey(BIZ, 900001) });
  });

  it('dos inicios simultáneos (StrictMode, doble clic) comparten un solo envío', async () => {
    const { flow, emitter, print } = setup();
    const [a, b] = await Promise.all([flow.start('s1', sale), flow.start('s1', sale)]);
    expect(a).toEqual(b);
    expect(emitter.providerCalls).toBe(1);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('reabrir la venta no emite ni imprime de nuevo', async () => {
    const storage = memStorage();
    const first = setup({ storage });
    await first.flow.start('s1', sale);
    const again = setup({ storage });
    const r = await again.flow.start('s1', sale);
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001, alreadyPrinted: true });
    expect(again.emitter.providerCalls).toBe(0);
    expect(again.print).not.toHaveBeenCalled();
  });

  it('falla de impresión: la boleta queda emitida; reintentar usa la misma clave y no emite', async () => {
    let ok = false;
    const { flow, print, emitter } = setup({ printOk: () => ok });
    const r = await flow.start('s1', sale);
    expect(r).toMatchObject({ phase: PHASE.PRINT_FAILED, folio: 900001 });
    ok = true;
    const r2 = await flow.retryPrint('s1', 900001);
    expect(r2.phase).toBe(PHASE.PRINTED);
    expect(print.mock.calls[1][0].idempotencyKey).toBe(print.mock.calls[0][0].idempotencyKey);
    expect(emitter.providerCalls).toBe(1);
  });

  it('pasa el número interno de la venta al original y a la reimpresión', async () => {
    const { flow, print } = setup();
    await flow.start('s1', { ...sale, saleNumber: 7 });
    await flow.reprint('s1', 900001);
    expect(print.mock.calls.map((c) => c[0].saleNumber)).toEqual([7, 7]);
    const other = setup();
    await other.flow.start('s9', sale);
    expect(other.print.mock.calls[0][0].saleNumber).toBeNull();
  });

  it('reimpresión: clave nueva, rotulada, mismo folio, sin emitir', async () => {
    const { flow, print, emitter } = setup();
    await flow.start('s1', sale);
    const r = await flow.reprint('s1', 900001);
    expect(r).toMatchObject({ phase: PHASE.PRINTED, folio: 900001, reprinted: true });
    expect(print.mock.calls[1][0].reprint).toBe(true);
    expect(print.mock.calls[1][0].idempotencyKey).not.toBe(originalPrintKey(BIZ, 900001));
    expect(emitter.providerCalls).toBe(1);
    const next = await setup({ storage: memStorage() }).flow.start('s2', sale);
    expect(next.folio).toBe(900001); // otro libro: sin relación
  });

  it('respuesta perdida (unknown): no se repite; conciliar recupera el mismo folio sin emitir', async () => {
    const { flow, emitter, print } = setup({ scenario: 'unknown' });
    const r = await flow.start('s1', sale);
    expect(r.phase).toBe(PHASE.UNCERTAIN);
    expect(print).not.toHaveBeenCalled();
    const r2 = await flow.start('s1', sale);
    expect(r2.phase).toBe(PHASE.UNCERTAIN);
    expect(emitter.providerCalls).toBe(1);
    await emitter.reconcile('s1');
    const r3 = await flow.refresh('s1', sale);
    expect(r3).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(emitter.providerCalls).toBe(1);
  });

  it('envío sin respuesta y sin fila en el servidor: no reenvía solo; solo a pedido', async () => {
    const storage = memStorage();
    const a = setup({ storage });
    a.emitter.emit = vi.fn(async () => ({ ok: false, status: 'error', code: 'RESPONSE_LOST' }));
    const flowA = createFiscalSaleFlow({ businessId: BIZ, emitter: a.emitter, print: a.print, marks: createFlowMarks({ businessId: BIZ, storage }) });
    expect((await flowA.start('s1', sale)).phase).toBe(PHASE.UNCERTAIN);
    // Recarga de la página: nueva instancia, mismo almacenamiento.
    const b = setup({ storage });
    const r = await b.flow.start('s1', sale);
    expect(r).toMatchObject({ phase: PHASE.UNCERTAIN, code: 'ATTEMPT_ALREADY_SENT' });
    expect(b.emitter.providerCalls).toBe(0);
    const r2 = await b.flow.emitAgain('s1', sale);
    expect(r2).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(b.emitter.providerCalls).toBe(1);
  });

  it('venta no pagada por completo: sin boleta (el TPV imprime el ticket normal)', async () => {
    const { flow, emitter } = setup();
    const r = await flow.start('s1', { ...sale, pendingBalance: 50 });
    expect(r).toMatchObject({ phase: PHASE.NOT_ELIGIBLE, code: 'SALE_NOT_ELIGIBLE' });
    expect(emitter.providerCalls).toBe(0);
  });

  it('sin resolución SII (modo real): no emite una boleta que no se podría imprimir', async () => {
    const { flow, emitter } = setup({ printBlocker: () => 'RESOLUCION_REQUIRED' });
    const r = await flow.start('s1', sale);
    expect(r).toMatchObject({ phase: PHASE.BLOCKED, code: 'RESOLUCION_REQUIRED' });
    expect(emitter.providerCalls).toBe(0);
  });

  it('conector no activo: no emite; al activarlo, reintentar emite e imprime una vez', async () => {
    let blocker = 'CONNECTOR_REQUIRED';
    const { flow, emitter, print } = setup({ printBlocker: () => blocker });
    expect(await flow.start('s1', sale)).toMatchObject({ phase: PHASE.BLOCKED, code: 'CONNECTOR_REQUIRED', retryable: true });
    expect(emitter.providerCalls).toBe(0);
    blocker = null;
    expect(await flow.start('s1', sale)).toMatchObject({ phase: PHASE.PRINTED, folio: 900001 });
    expect(emitter.providerCalls).toBe(1);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('rechazo del proveedor: sin folio y sin reintento automático', async () => {
    const { flow, emitter, print } = setup({ scenario: 'rejected' });
    expect((await flow.start('s1', sale)).phase).toBe(PHASE.REJECTED);
    expect((await flow.start('s1', sale)).phase).toBe(PHASE.REJECTED);
    expect(emitter.providerCalls).toBe(1);
    expect(print).not.toHaveBeenCalled();
  });

  it('estado no disponible: no emite', async () => {
    const { flow, emitter } = setup();
    emitter.status = async () => ({ ok: false, code: 'STATUS_UNAVAILABLE' });
    const f = createFiscalSaleFlow({ businessId: BIZ, emitter, print: vi.fn(), marks: createFlowMarks({ businessId: BIZ, storage: memStorage() }) });
    expect((await f.start('s1', sale)).phase).toBe(PHASE.ERROR);
  });
});
