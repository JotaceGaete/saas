// Servicio fiscal (fiscal-emit) caído, lento o con respuestas inesperadas. Reglas:
// - lo que no se sabe es «desconocido» o «incierto», nunca «no emitida»;
// - un envío incierto no se repite solo, ni al consultar ni al reabrir la venta;
// - solo un rechazo conocido como previo al reclamo permite decir que no hubo emisión.
import { describe, it, expect, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: vi.fn() }, auth: { getSession: vi.fn() } } }));

const {
  createFiscalSaleFlow, createFlowMarks, describeFlowCode, PHASE, PRE_CLAIM_REJECTION_CODES,
} = await import('./fiscalSaleFlow');

const BIZ = 'biz-1';
const SALE = { items: [{ name: 'Pan', quantity: 1, unit_price: 1000 }], payments: [{ method: 'cash', amount: 1000 }], total: 1000, discountAmount: 0, pendingBalance: 0 };

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// Emisor controlado: cada prueba decide qué responde el servicio.
function setup({ status, emit, storage = memStorage() } = {}) {
  const emitter = {
    mode: 'live',
    status: vi.fn(status ?? (async () => ({ ok: true, data: { state: 'none', canEmit: true } }))),
    emit: vi.fn(emit ?? (async () => ({ ok: true, status: 'issued', folio: 25007 }))),
    loadDte: vi.fn(async () => new Uint8Array([1])),
  };
  const print = vi.fn(async () => ({ ok: true }));
  const marks = createFlowMarks({ businessId: BIZ, storage, mode: 'live' });
  const flow = createFiscalSaleFlow({ businessId: BIZ, emitter, print, marks, mode: 'live' });
  return { emitter, print, flow, marks, storage };
}

const down = async () => ({ ok: false, code: 'STATUS_UNAVAILABLE' });

describe('fiscal-emit no responde', () => {
  it('estado sin respuesta al cobrar: ERROR con estado desconocido; no emite ni imprime', async () => {
    const { flow, emitter, print } = setup({ status: down });
    const r = await flow.start('s1', SALE);
    expect(r).toEqual({ phase: PHASE.ERROR, code: 'STATUS_UNAVAILABLE' });
    expect(emitter.emit).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
  });

  it('el mensaje dice «desconocido» y nunca «no se emitió»', () => {
    const msg = describeFlowCode('STATUS_UNAVAILABLE');
    expect(msg).toMatch(/desconocido/i);
    expect(msg).toMatch(/comprobante interno/i);
    expect(msg).not.toMatch(/No se emitió ninguna boleta/i);
  });

  it('emisión sin respuesta (RESPONSE_LOST): incierta; consultar después no la reenvía aunque el estado tampoco responda', async () => {
    let statusUp = true;
    const { flow, emitter } = setup({
      status: async () => (statusUp ? { ok: true, data: { state: 'none', canEmit: true } } : { ok: false, code: 'STATUS_UNAVAILABLE' }),
      emit: async () => ({ ok: false, status: 'error', code: 'RESPONSE_LOST' }),
    });
    expect(await flow.start('s1', SALE)).toMatchObject({ phase: PHASE.UNCERTAIN, code: 'RESPONSE_LOST' });
    statusUp = false;
    // Con el envío ya hecho desde este equipo, no saber el estado sigue siendo incierto (no ERROR).
    expect(await flow.refresh('s1', SALE)).toEqual({ phase: PHASE.UNCERTAIN, code: 'STATUS_UNAVAILABLE' });
    statusUp = true;
    // El servidor aún dice «sin fila» (p. ej. la respuesta se perdió antes de reclamar): tampoco se reenvía sola.
    expect(await flow.start('s1', SALE)).toMatchObject({ phase: PHASE.UNCERTAIN, code: 'ATTEMPT_ALREADY_SENT' });
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('reabrir la venta (otro montaje, misma marca local) tras un envío incierto no emite', async () => {
    const storage = memStorage();
    const a = setup({ storage, emit: async () => ({ ok: false, status: 'error', code: 'RESPONSE_LOST' }) });
    await a.flow.start('s1', SALE);
    const b = setup({ storage });
    expect(await b.flow.start('s1', SALE)).toMatchObject({ phase: PHASE.UNCERTAIN, code: 'ATTEMPT_ALREADY_SENT' });
    expect(b.emitter.emit).not.toHaveBeenCalled();
  });

  it('una excepción inesperada después de enviar queda incierta y la marca de envío se conserva', async () => {
    const { flow, marks } = setup({ emit: async () => { throw new TypeError('fetch failed'); } });
    expect(await flow.start('s1', SALE)).toMatchObject({ phase: PHASE.UNCERTAIN });
    expect(marks.attempted('s1')).toBe(true);
  });
});

describe('códigos después de enviar la emisión', () => {
  it.each(['FISCAL_FOLIO_DUPLICATE', 'FISCAL_DOCUMENT_ISSUER_MISMATCH', 'SERVER_ERROR', 'WORKER_ERROR', 'CODIGO_NUEVO'])(
    '%s: incierto (pudo haber documento en DTE Core); conserva la marca y no se reenvía', async (code) => {
      const { flow, emitter, marks } = setup({ emit: async () => ({ ok: false, status: 'error', code }) });
      const r = await flow.start('s1', SALE);
      expect(r).toEqual({ phase: PHASE.UNCERTAIN, code });
      expect(marks.attempted('s1')).toBe(true);
      await flow.start('s1', SALE);
      expect(emitter.emit).toHaveBeenCalledTimes(1);
    });

  it.each(['FISCAL_EMISSION_DISABLED', 'FISCAL_BUSINESS_NOT_ALLOWED', 'CREDENTIALS_MISSING', 'UNAUTHENTICATED', 'ORIGIN_NOT_ALLOWED', 'FISCAL_NOT_CONFIGURED'])(
    '%s: rechazo previo al reclamo → no hubo emisión (se limpia la marca)', async (code) => {
      expect(PRE_CLAIM_REJECTION_CODES.has(code)).toBe(true);
      const { flow, marks } = setup({ emit: async () => ({ ok: false, status: 'error', code }) });
      const r = await flow.start('s1', SALE);
      expect([PHASE.BLOCKED, PHASE.NOT_ELIGIBLE]).toContain(r.phase);
      expect(marks.attempted('s1')).toBe(false);
    });

  it('NOT_EMITTABLE_IN_STATE: la venta ya tiene fila; se lee su estado real, no se emite de nuevo', async () => {
    let calls = 0;
    const { flow, emitter } = setup({
      status: async () => (calls++ === 0 ? { ok: true, data: { state: 'none', canEmit: true } } : { ok: true, data: { state: 'unknown', folio: null } }),
      emit: async () => ({ ok: false, status: 'error', code: 'NOT_EMITTABLE_IN_STATE' }),
    });
    expect(await flow.start('s1', SALE)).toMatchObject({ phase: PHASE.UNCERTAIN, code: 'UNKNOWN_REQUIRES_RECONCILIATION' });
    expect(emitter.emit).toHaveBeenCalledTimes(1);
  });

  it('los códigos que pueden llegar después del proveedor no están entre los rechazos previos', () => {
    for (const c of ['FISCAL_FOLIO_DUPLICATE', 'FISCAL_DOCUMENT_ISSUER_MISMATCH', 'PERSIST_PENDING_RECOVERY', 'UNKNOWN_REQUIRES_RECONCILIATION', 'RESPONSE_LOST', 'INTERNAL', 'ALREADY_IN_PROGRESS']) {
      expect(PRE_CLAIM_REJECTION_CODES.has(c)).toBe(false);
    }
  });
});
