import { describe, it, expect, vi } from 'vitest';
import { reprintBoletaIfIssued } from './fiscalCashReprint';

const base = { businessId: 'b1', invoiceId: 'v1', saleNumber: 67, idempotencyKey: 'k1', mode: 'live' };

describe('reimpresión desde Caja', () => {
  it('con boleta emitida reimprime la boleta (REIMPRESION) con la resolución del servidor', async () => {
    const print = vi.fn(async () => ({ ok: true, folio: 25007, printerName: 'XP-80C' }));
    const r = await reprintBoletaIfIssued({
      ...base,
      deps: {
        status: async () => ({ ok: true, data: { state: 'issued', folio: 25007, resolucion: { numero: 99, fecha: '2014-10-21' } } }),
        loadDte: async () => new Uint8Array([1]),
        print,
      },
    });
    expect(r).toEqual({ handled: true, ok: true, folio: 25007, printerName: 'XP-80C' });
    const arg = print.mock.calls[0][0];
    expect(arg).toMatchObject({ businessId: 'b1', reprint: true, idempotencyKey: 'k1', saleNumber: 67 });
    expect(arg.settings.resolucion).toEqual({ numero: '99', anio: '2014', fecha: '2014-10-21' });
  });

  it('sin boleta emitida, o fuera del modo real, deja el ticket de siempre', async () => {
    const print = vi.fn();
    for (const status of [
      async () => ({ ok: true, data: { state: 'none' } }),
      async () => ({ ok: false, code: 'FISCAL_BUSINESS_NOT_ALLOWED' }),
      async () => ({ ok: true, data: { state: 'unknown', folio: 51 } }),
    ]) {
      expect(await reprintBoletaIfIssued({ ...base, deps: { status, print } })).toEqual({ handled: false });
    }
    const status = vi.fn();
    expect(await reprintBoletaIfIssued({ ...base, mode: 'off', deps: { status, print } })).toEqual({ handled: false });
    expect(status).not.toHaveBeenCalled();
    expect(print).not.toHaveBeenCalled();
  });

  it('si la boleta existe pero falla el XML o la impresión, avisa y no imprime el ticket', async () => {
    const status = async () => ({ ok: true, data: { state: 'issued', folio: 25007 } });
    const a = await reprintBoletaIfIssued({ ...base, deps: { status, loadDte: async () => { throw new Error('sin XML'); } } });
    expect(a).toEqual({ handled: true, ok: false, message: 'sin XML' });
    const b = await reprintBoletaIfIssued({ ...base, deps: { status, loadDte: async () => new Uint8Array([1]), print: async () => ({ ok: false, message: 'conector' }) } });
    expect(b).toEqual({ handled: true, ok: false, message: 'conector' });
  });
});
