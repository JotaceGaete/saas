import { describe, it, expect } from 'vitest';
import { computeExpectedCash, isCashBalanced, classifyCashDifference } from './arqueo';

describe('computeExpectedCash', () => {
  it('suma fondo inicial + cobros en efectivo + entradas manuales - salidas manuales', () => {
    const session = { initial_amount: 10000 };
    const payments = [
      { payment_method: 'cash', amount: 5000 },
      { payment_method: 'card', amount: 20000 }, // no afecta efectivo físico
    ];
    const movements = [
      { direction: 'in', payment_method: 'cash', amount: 2000 },
      { direction: 'out', payment_method: 'cash', amount: 1000 },
    ];
    expect(computeExpectedCash(session, payments, movements)).toBe(16000);
  });

  it('ignora pagos y movimientos anulados', () => {
    const session = { initial_amount: 0 };
    const payments = [{ payment_method: 'cash', amount: 5000, voided_at: '2026-07-08T00:00:00Z' }];
    const movements = [{ direction: 'in', amount: 2000, voided_at: '2026-07-08T00:00:00Z' }];
    expect(computeExpectedCash(session, payments, movements)).toBe(0);
  });
});

describe('isCashBalanced', () => {
  it('es true cuando la diferencia es exactamente 0', () => {
    expect(isCashBalanced(0)).toBe(true);
  });

  it('es true para diferencias menores a 1 (redondeo)', () => {
    expect(isCashBalanced(0.5)).toBe(true);
    expect(isCashBalanced(-0.5)).toBe(true);
  });

  it('es false cuando hay sobrante o faltante real', () => {
    expect(isCashBalanced(1500)).toBe(false);
    expect(isCashBalanced(-1500)).toBe(false);
  });

  it('es false mientras no se ha ingresado el monto contado (diff null)', () => {
    expect(isCashBalanced(null)).toBe(false);
    expect(isCashBalanced(undefined)).toBe(false);
  });
});

describe('classifyCashDifference', () => {
  it('clasifica la caja cuadrada en verde con etiqueta "cuadra"', () => {
    const result = classifyCashDifference(0, 50000);
    expect(result.emoji).toBe('🟢');
    expect(result.color).toBe('text-emerald-600');
    expect(result.label).toBe('cuadra');
  });

  it('clasifica un sobrante pequeño como amarillo', () => {
    const result = classifyCashDifference(1000, 50000); // 2% del esperado
    expect(result.emoji).toBe('🟠');
    expect(result.label).toBe('sobrante');
  });

  it('clasifica un faltante grande como rojo', () => {
    const result = classifyCashDifference(-10000, 50000); // 20% del esperado
    expect(result.emoji).toBe('🔴');
    expect(result.label).toBe('faltante');
  });

  it('no clasifica nada mientras no hay monto contado', () => {
    const result = classifyCashDifference(null, 50000);
    expect(result.emoji).toBe('');
    expect(result.label).toBe('');
  });
});
