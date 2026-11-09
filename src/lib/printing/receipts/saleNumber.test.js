import { describe, expect, it } from 'vitest';
import { formatSaleNumber, saleNumberFooterLine } from './saleNumber';

describe('formatSaleNumber', () => {
  it('formatea el entero del servidor como NV-0001', () => {
    expect(formatSaleNumber(1)).toBe('NV-0001');
    expect(formatSaleNumber(42)).toBe('NV-0042');
    expect(formatSaleNumber(123456)).toBe('NV-123456');
    expect(formatSaleNumber('7')).toBe('NV-0007');
  });
  it('conserva tal cual un valor que ya viene con su forma', () => {
    expect(formatSaleNumber('NV-0042')).toBe('NV-0042');
    expect(formatSaleNumber('V-000001')).toBe('V-000001');
  });
  it('sin número válido devuelve null (nunca inventa)', () => {
    for (const v of [null, undefined, '', '  ', 0, -3, 1.5, '0', NaN]) expect(formatSaleNumber(v)).toBeNull();
  });
  it('línea de pie discreta', () => {
    expect(saleNumberFooterLine(5)).toEqual({ type: 'text', text: 'Ref. interna NV-0005', align: 'center' });
    expect(saleNumberFooterLine(null)).toBeNull();
  });
});
