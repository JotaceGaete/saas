import { describe, it, expect, vi, beforeEach } from 'vitest';

const invoke = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }));

import { emitFiscalSale, describeFiscalEmitError } from './fiscalEmitService';

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

  it('error sin cuerpo legible cae en código genérico', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: { context: { json: async () => { throw new Error('x'); } } } });
    const r = await emitFiscalSale('sale-1');
    expect(r.code).toBe('SERVER_ERROR');
  });

  it('código desconocido tiene mensaje genérico', () => {
    expect(describeFiscalEmitError('WHATEVER')).toMatch(/No pudimos emitir/);
  });
});
