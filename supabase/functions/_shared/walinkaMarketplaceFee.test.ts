/**
 * walinkaMarketplaceFee — batería de tests unitarios (MP-MARKETPLACE-1).
 * Ejecutar: npx vitest run supabase/functions/_shared/walinkaMarketplaceFee.test.ts
 */
import { describe, it, expect } from 'vitest';
import { computeWalinkaMarketplaceFee, WALINKA_MARKETPLACE_FEE_BPS } from './walinkaMarketplaceFee';

describe('WALINKA_MARKETPLACE_FEE_BPS', () => {
  it('100 bps = 1%, único lugar donde vive el porcentaje', () => {
    expect(WALINKA_MARKETPLACE_FEE_BPS).toBe(100);
  });
});

describe('computeWalinkaMarketplaceFee — CLP (redondeo al peso entero)', () => {
  it('10.000 -> 100', () => {
    expect(computeWalinkaMarketplaceFee(1000000, 'CLP')).toEqual({ ok: true, feeCents: 10000, fee: 100 });
  });
  it('10.050 -> 101 (redondeo half-up, no trunca)', () => {
    expect(computeWalinkaMarketplaceFee(1005000, 'CLP')).toEqual({ ok: true, feeCents: 10100, fee: 101 });
  });
  it('10.049 -> 100', () => {
    expect(computeWalinkaMarketplaceFee(1004900, 'CLP')).toEqual({ ok: true, feeCents: 10000, fee: 100 });
  });
  it('999 -> 10', () => {
    expect(computeWalinkaMarketplaceFee(99900, 'CLP')).toEqual({ ok: true, feeCents: 1000, fee: 10 });
  });
  it('1 -> 0 (Math.round(0.01) = 0 -- no se inventa una comisión mínima de $1 sin decisión de negocio)', () => {
    expect(computeWalinkaMarketplaceFee(100, 'CLP')).toEqual({ ok: true, feeCents: 0, fee: 0 });
  });
  it('0 -> 0 (válido, no rechazado)', () => {
    expect(computeWalinkaMarketplaceFee(0, 'CLP')).toEqual({ ok: true, feeCents: 0, fee: 0 });
  });
});

describe('computeWalinkaMarketplaceFee — ARS (redondeo al centavo entero)', () => {
  it('10000.00 -> 100.00', () => {
    expect(computeWalinkaMarketplaceFee(1000000, 'ARS')).toEqual({ ok: true, feeCents: 10000, fee: 100 });
  });
  it('10050.50 -> 100.51 (redondeo half-up en centavos)', () => {
    expect(computeWalinkaMarketplaceFee(1005050, 'ARS')).toEqual({ ok: true, feeCents: 10051, fee: 100.51 });
  });
  it('999.99 -> 10.00', () => {
    expect(computeWalinkaMarketplaceFee(99999, 'ARS')).toEqual({ ok: true, feeCents: 1000, fee: 10 });
  });
  it('0 -> 0.00', () => {
    expect(computeWalinkaMarketplaceFee(0, 'ARS')).toEqual({ ok: true, feeCents: 0, fee: 0 });
  });
});

describe('computeWalinkaMarketplaceFee — CLP vs ARS redondean en bases distintas (no es un accidente)', () => {
  it('mismo totalCents (10.050 unidades), CLP redondea en pesos (101) y ARS redondea en centavos (100.50)', () => {
    expect(computeWalinkaMarketplaceFee(1005000, 'CLP')).toEqual({ ok: true, feeCents: 10100, fee: 101 });
    expect(computeWalinkaMarketplaceFee(1005000, 'ARS')).toEqual({ ok: true, feeCents: 10050, fee: 100.5 });
  });
});

describe('computeWalinkaMarketplaceFee — moneda no soportada', () => {
  it('rechaza USD/MXN/BRL/cualquier moneda distinta de CLP/ARS', () => {
    expect(computeWalinkaMarketplaceFee(1000000, 'USD')).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
    expect(computeWalinkaMarketplaceFee(1000000, 'MXN')).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
    expect(computeWalinkaMarketplaceFee(1000000, 'BRL')).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
  });
  it('rechaza minúsculas -- sin fuzzy matching (\'clp\' !== \'CLP\')', () => {
    expect(computeWalinkaMarketplaceFee(1000000, 'clp')).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
  });
  it('rechaza vacío/null/undefined', () => {
    expect(computeWalinkaMarketplaceFee(1000000, '')).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
    // @ts-expect-error -- probando entrada manipulada/no confiable a propósito
    expect(computeWalinkaMarketplaceFee(1000000, null)).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
    // @ts-expect-error -- probando entrada manipulada/no confiable a propósito
    expect(computeWalinkaMarketplaceFee(1000000, undefined)).toEqual({ ok: false, reason: 'UNSUPPORTED_CURRENCY' });
  });
});

describe('computeWalinkaMarketplaceFee — montos inválidos', () => {
  it('negativo -> rechazado (INVALID_AMOUNT), nunca calcula una comisión negativa', () => {
    expect(computeWalinkaMarketplaceFee(-1000, 'CLP')).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
    expect(computeWalinkaMarketplaceFee(-1, 'ARS')).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
  });
  it('NaN/Infinity -> rechazado', () => {
    expect(computeWalinkaMarketplaceFee(NaN, 'CLP')).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
    expect(computeWalinkaMarketplaceFee(Infinity, 'ARS')).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
  });
  it('no entero (totalCents debe venir ya en centavos enteros del caller) -> rechazado', () => {
    expect(computeWalinkaMarketplaceFee(100.5, 'CLP')).toEqual({ ok: false, reason: 'INVALID_AMOUNT' });
  });
});

describe('computeWalinkaMarketplaceFee — valores grandes dentro del rango NUMERIC(10,2) de la DB', () => {
  it('total máximo representable (99.999.999,99) calcula sin overflow ni pérdida de precisión', () => {
    const maxTotalCents = 9999999999; // 99999999.99 * 100
    const result = computeWalinkaMarketplaceFee(maxTotalCents, 'ARS');
    expect(result).toEqual({ ok: true, feeCents: 100000000, fee: 1000000 });
    expect(Number.isSafeInteger(maxTotalCents)).toBe(true);
  });
});
