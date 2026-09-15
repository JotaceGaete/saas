/**
 * utils/tax/vatRates.js — TAX-SUMMARY-1: única fuente de tasas de IVA para
 * código nuevo. Chile es el único mercado activo hoy; Argentina se prueba
 * igual aunque no esté habilitada, para que activarla más adelante no
 * dependa de nada más que un valor en la tabla.
 */
import { describe, it, expect } from 'vitest';
import { getVatRateForCountry, splitTaxIncludedAmount } from './vatRates';

describe('getVatRateForCountry', () => {
  it('Chile (CL) es 19%', () => {
    expect(getVatRateForCountry('CL')).toBe(19);
  });

  it('es case-insensitive', () => {
    expect(getVatRateForCountry('cl')).toBe(19);
    expect(getVatRateForCountry('Cl')).toBe(19);
  });

  it('Argentina (AR) ya devuelve 21% aunque el mercado no esté habilitado todavía', () => {
    expect(getVatRateForCountry('AR')).toBe(21);
    expect(getVatRateForCountry('ar')).toBe(21);
  });

  it('país desconocido o vacío/null/undefined cae al default de Chile (19%)', () => {
    expect(getVatRateForCountry('XX')).toBe(19);
    expect(getVatRateForCountry('')).toBe(19);
    expect(getVatRateForCountry(null)).toBe(19);
    expect(getVatRateForCountry(undefined)).toBe(19);
  });
});

describe('splitTaxIncludedAmount', () => {
  it('descompone un total con IVA incluido en neto + impuesto (19%)', () => {
    const result = splitTaxIncludedAmount(119000, 19);
    expect(result.total).toBe(119000);
    expect(result.net).toBeCloseTo(100000, 0);
    expect(result.tax).toBeCloseTo(19000, 0);
  });

  it('neto + impuesto reconstruye el total original (sin perder centavos por redondeo)', () => {
    const result = splitTaxIncludedAmount(409000, 19);
    expect(+(result.net + result.tax).toFixed(2)).toBe(409000);
  });

  it('con tasa 0 (o ausente), todo el monto es neto, sin impuesto', () => {
    expect(splitTaxIncludedAmount(50000, 0)).toEqual({ net: 50000, tax: 0, total: 50000 });
    expect(splitTaxIncludedAmount(50000)).toEqual({ net: 50000, tax: 0, total: 50000 });
  });

  it('con total 0/null/undefined, todo queda en 0 (nunca NaN)', () => {
    expect(splitTaxIncludedAmount(0, 19)).toEqual({ net: 0, tax: 0, total: 0 });
    expect(splitTaxIncludedAmount(null, 19)).toEqual({ net: 0, tax: 0, total: 0 });
    expect(splitTaxIncludedAmount(undefined, 19)).toEqual({ net: 0, tax: 0, total: 0 });
  });

  it('nunca modifica ni redondea el total original -- solo neto/impuesto', () => {
    const result = splitTaxIncludedAmount(23000, 19);
    expect(result.total).toBe(23000);
  });
});
