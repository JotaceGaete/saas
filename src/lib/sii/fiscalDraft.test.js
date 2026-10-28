import { describe, it, expect } from 'vitest';
import { createFiscalDraft, normalizeChileanRut } from './fiscalDraft';

describe('piloto fiscal: borradores sin emisión', () => {
  it('valida dígito verificador y normaliza RUT', () => {
    expect(normalizeChileanRut('12.345.678-5')).toBe('12345678-5');
    expect(() => normalizeChileanRut('12.345.678-9')).toThrow();
  });
  it('calcula importes enteros y clave estable por venta y comercio', () => {
    const data = { businessId: 'tenant-a', issuerRut: '12.345.678-5', saleId: 'sale-1', paymentMethod: 'cash', items: [{ name: 'Artículo', quantity: 2, unitPrice: 1000 }] };
    const a = createFiscalDraft(data);
    expect(a.total).toBe(2000);
    expect(a.status).toBe('draft_only');
    expect(a.idempotencyKey).toBe(createFiscalDraft(data).idempotencyKey);
    expect(createFiscalDraft({ ...data, businessId: 'tenant-b' }).idempotencyKey).not.toBe(a.idempotencyKey);
  });
  it('rechaza importes decimales, moneda ajena y ventas vacías', () => {
    const base = { businessId: 'a', issuerRut: '12345678-5', saleId: 'b', paymentMethod: 'cash', items: [{ name: 'x', quantity: 1, unitPrice: 1 }] };
    expect(() => createFiscalDraft({ ...base, currency: 'ARS' })).toThrow();
    expect(() => createFiscalDraft({ ...base, items: [] })).toThrow();
    expect(() => createFiscalDraft({ ...base, items: [{ name: 'x', quantity: 1, unitPrice: 1.5 }] })).toThrow();
  });
});
