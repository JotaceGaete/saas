// Boletas reales y simuladas no comparten marcas locales ni claves de impresión.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

const { createFiscalSaleFlow, createFlowMarks, originalPrintKey, reprintKey, MODULE_OFF_CODES, PHASE } = await import('./fiscalSaleFlow');

const BIZ = 'biz-1';
const sale = { items: [{ name: 'Pan', quantity: 1, unit_price: 1190 }], payments: [{ method: 'cash', amount: 1190 }], total: 1190, discountAmount: 0, pendingBalance: 0 };

function memStorage() {
  const m = new Map();
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Emisor "real" falso: la venta ya está emitida con el folio indicado.
function liveEmitter(folio) {
  return {
    mode: 'live',
    status: vi.fn(async () => ({ ok: true, data: { state: 'issued', folio, siiStatus: 'unverified' } })),
    emit: vi.fn(),
    loadDte: vi.fn(async () => new Uint8Array([60, 68, 84, 69])),
  };
}

describe('separación por modo', () => {
  it('claves de impresión: el formato simulado no cambia; el real lleva prefijo y tipo de documento', () => {
    expect(originalPrintKey(BIZ, 900001)).toBe(`fiscal:${BIZ}:900001:boleta`);
    expect(originalPrintKey(BIZ, 900001, 'simulated')).toBe(`fiscal:${BIZ}:900001:boleta`);
    expect(originalPrintKey(BIZ, 900001, 'live')).toBe(`fiscal-live:${BIZ}:39:900001:boleta`);
    expect(originalPrintKey(BIZ, 900001, 'live')).not.toBe(originalPrintKey(BIZ, 900001));
    expect(reprintKey(BIZ, 5, { now: 1, nonce: 'a', mode: 'live' })).toBe(`fiscal-live-reprint:${BIZ}:39:5:1a`);
    expect(reprintKey(BIZ, 5, { now: 1, nonce: 'a' })).toBe(`fiscal-reprint:${BIZ}:5:1a`);
  });

  it('una marca de «ya impresa» de una boleta simulada no impide imprimir la real del mismo folio', async () => {
    const storage = memStorage();
    createFlowMarks({ businessId: BIZ, storage }).markPrinted(900001); // simulada, de antes
    const emitter = liveEmitter(900001);
    const print = vi.fn(async () => ({ ok: true }));
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks: createFlowMarks({ businessId: BIZ, storage, mode: 'live' }) });
    const r = await flow.start('sale-1', sale);
    expect(r.phase).toBe(PHASE.PRINTED);
    expect(r.alreadyPrinted).toBeUndefined();
    expect(print).toHaveBeenCalledTimes(1);
    expect(print.mock.calls[0][0].idempotencyKey).toBe(`fiscal-live:${BIZ}:39:900001:boleta`);
    expect(emitter.emit).not.toHaveBeenCalled();
    // Y la boleta real sí queda marcada: no se imprime dos veces.
    const again = await flow.start('sale-1', sale);
    expect(again.alreadyPrinted).toBe(true);
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('el modo se toma del emisor si no se indica', async () => {
    const emitter = liveEmitter(42);
    const print = vi.fn(async () => ({ ok: true }));
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print });
    await flow.start('sale-2', sale);
    expect(print.mock.calls[0][0].idempotencyKey).toBe(`fiscal-live:${BIZ}:39:42:boleta`);
  });

  it('negocio fuera de la lista del servidor: módulo apagado (comprobante interno, sin panel)', async () => {
    expect(MODULE_OFF_CODES.has('FISCAL_BUSINESS_NOT_ALLOWED')).toBe(true);
    const emitter = { mode: 'live', status: vi.fn(async () => ({ ok: true, data: { state: 'none', canEmit: false, blockedReason: 'FISCAL_BUSINESS_NOT_ALLOWED' } })), emit: vi.fn(), loadDte: vi.fn() };
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print: vi.fn() });
    const r = await flow.start('sale-3', sale);
    expect(r).toMatchObject({ phase: PHASE.NOT_ELIGIBLE, code: 'FISCAL_BUSINESS_NOT_ALLOWED' });
    expect(emitter.emit).not.toHaveBeenCalled();
  });

  it('API key sin verificar contra el RUT (migración H): comprobante interno, nunca emite ni reintenta', async () => {
    const emitter = { mode: 'live', status: vi.fn(async () => ({ ok: true, data: { state: 'none', canEmit: false, blockedReason: 'FISCAL_IDENTITY_NOT_VERIFIED' } })), emit: vi.fn(), loadDte: vi.fn() };
    const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print: vi.fn() });
    const r = await flow.start('sale-4', sale);
    expect(r).toMatchObject({ phase: PHASE.NOT_ELIGIBLE, code: 'FISCAL_IDENTITY_NOT_VERIFIED' });
    expect(emitter.emit).not.toHaveBeenCalled();
  });
});
