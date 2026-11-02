import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }));

import { emitFiscalSale, describeFiscalEmitError, getFiscalSaleStatus, LOCKING_CODES, SII_STATUS_LABELS } from './fiscalEmitService';

describe('emitFiscalSale', () => {
  beforeEach(() => invoke.mockReset());

  it('envía solo la acción y la venta, sin secretos', async () => {
    invoke.mockResolvedValueOnce({ data: { status: 'issued', folio: 51107 }, error: null });
    const r = await emitFiscalSale('sale-1');
    expect(invoke).toHaveBeenCalledWith('fiscal-emit', { body: { action: 'emit', saleId: 'sale-1' } });
    expect(r).toEqual({ ok: true, status: 'issued', folio: 51107 });
  });

  it('error del servidor: devuelve el código del handler', async () => {
    const context = { json: async () => ({ error: 'PROVIDER_NOT_READY' }) };
    invoke.mockResolvedValueOnce({ data: null, error: { context } });
    const r = await emitFiscalSale('sale-1');
    expect(r).toEqual({ ok: false, status: 'error', code: 'PROVIDER_NOT_READY' });
    expect(describeFiscalEmitError(r.code)).toMatch(/todavía no está habilitado/);
  });

  it('resultado incierto se marca como no reintentable', async () => {
    invoke.mockResolvedValueOnce({ data: { status: 'unknown' }, error: null });
    const r = await emitFiscalSale('sale-1');
    expect(r.ok).toBe(false);
    expect(r.code).toBe('UNKNOWN_REQUIRES_RECONCILIATION');
  });

  it('error sin cuerpo legible: resultado incierto (RESPONSE_LOST), bloquea el botón', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: { json: async () => { throw new Error('x'); } } } });
    const r = await emitFiscalSale('sale-1');
    expect(r.code).toBe('RESPONSE_LOST');
    expect(LOCKING_CODES.has(r.code)).toBe(true);
  });

  it('excepción de red: RESPONSE_LOST, nunca se reintenta', async () => {
    invoke.mockRejectedValueOnce(new Error('network'));
    const r = await emitFiscalSale('sale-1');
    expect(r.code).toBe('RESPONSE_LOST');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('código desconocido tiene mensaje genérico', () => {
    expect(describeFiscalEmitError('WHATEVER')).toMatch(/No pudimos emitir/);
  });
});

describe('getFiscalSaleStatus', () => {
  beforeEach(() => invoke.mockReset());

  it('pide solo la acción status (solo lectura)', async () => {
    invoke.mockResolvedValueOnce({ data: { state: 'none', canEmit: true }, error: null });
    const r = await getFiscalSaleStatus('sale-1');
    expect(invoke).toHaveBeenCalledWith('fiscal-emit', { body: { action: 'status', saleId: 'sale-1' } });
    expect(r).toEqual({ ok: true, data: { state: 'none', canEmit: true } });
  });

  it('error: no lanza y devuelve el código', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: { json: async () => ({ error: 'SALE_NOT_FOUND' }) } } });
    expect(await getFiscalSaleStatus('sale-1')).toEqual({ ok: false, code: 'SALE_NOT_FOUND' });
    invoke.mockRejectedValueOnce(new Error('network'));
    expect(await getFiscalSaleStatus('sale-1')).toEqual({ ok: false, code: 'STATUS_UNAVAILABLE' });
  });

  it('etiquetas SII distinguen emitida de aceptada', () => {
    expect(SII_STATUS_LABELS.unverified).toMatch(/sin verificar/);
    expect(SII_STATUS_LABELS.accepted).toBe('Aceptada por el SII');
  });
});
