import { describe, it, expect, vi } from 'vitest';
import { buildDte39Payload, emitDte39Claimed } from './dtecore39.js';

const sale = () => ({
  operationId: 'WALINKA-SALE-123', rutOperador: '76543210-3',
  fechaEmision: '2026-10-29', paymentCode: 'EF',
  items: [{ code: 'SKU-1', description: 'Producto', unitPrice: 11900,
    quantity: 1, discountAmount: 0, subtotal: 11900, isExempt: false }],
  total: 11900, amountTendered: 20000
});

describe('DTECore DTE39 adapter', () => {
  it('maps a paid POS sale to DTE39 with IVA-inclusive amounts', () => {
    const payload = buildDte39Payload(sale());
    expect(payload.idBoletaOperacion).toBe('WALINKA-SALE-123');
    expect(payload.total).toBe(11900);
    expect(payload.vuelto).toBe('8100');
    expect(payload.detalles[0].precioSubtotal).toBe(11900);
    expect(payload.formatoPdf).toBe('80mm');
    expect(payload.cliente.razonSocial).toBe('CONSUMIDOR FINAL');
  });
  it('rejects inconsistent sale totals', () => {
    const input = sale(); input.total = 12000;
    expect(() => buildDte39Payload(input)).toThrow('SALE_TOTAL_MISMATCH');
  });
  it('rejects missing tax classification rather than guessing', () => {
    const input = sale(); delete input.items[0].isExempt;
    expect(() => buildDte39Payload(input)).toThrow('TAX_CLASSIFICATION_REQUIRED');
  });
  it('rejects line discounts that do not reconcile', () => {
    const input = sale(); input.items[0].discountAmount = 100;
    expect(() => buildDte39Payload(input)).toThrow('ITEM_SUBTOTAL_MISMATCH');
  });
  it('never calls provider when emission flag is disabled', async () => {
    const previous = process.env.DTECORE_ENABLE_EMISSION;
    delete process.env.DTECORE_ENABLE_EMISSION;
    const fetchImpl = vi.fn();
    try {
      await expect(emitDte39Claimed({
        payload: buildDte39Payload(sale()), apiKey: 'dummy', fetchImpl
      })).rejects.toThrow('DTECORE_EMISSION_DISABLED');
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.DTECORE_ENABLE_EMISSION;
      else process.env.DTECORE_ENABLE_EMISSION = previous;
    }
  });
});
