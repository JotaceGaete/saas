import { describe, it, expect } from 'vitest';
import { computeExpectedCash, isCashBalanced, classifyCashDifference, getArqueoSummary, recalcArqueoOnCorrection } from './arqueo';

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

describe('getArqueoSummary (resumen de una caja ya cerrada)', () => {
  it('caja cerrada cuadrada: sin diferencia, sin observación obligatoria', () => {
    const session = { expected_cash: 50000, counted_cash: 50000, cash_difference: 0, closing_notes: null };
    const summary = getArqueoSummary(session);
    expect(summary.balanced).toBe(true);
    expect(summary.label).toBe('cuadra');
    expect(summary.emoji).toBe('🟢');
    expect(summary.diff).toBe(0);
  });

  it('caja cerrada con sobrante', () => {
    const session = { expected_cash: 50000, counted_cash: 52000, cash_difference: 2000, closing_notes: 'Propina no registrada como pago' };
    const summary = getArqueoSummary(session);
    expect(summary.balanced).toBe(false);
    expect(summary.label).toBe('sobrante');
    expect(summary.diff).toBe(2000);
    expect(summary.notes).toBe('Propina no registrada como pago');
  });

  it('caja cerrada con faltante', () => {
    const session = { expected_cash: 50000, counted_cash: 47000, cash_difference: -3000, closing_notes: 'Vuelto mal dado en la mañana' };
    const summary = getArqueoSummary(session);
    expect(summary.balanced).toBe(false);
    expect(summary.label).toBe('faltante');
    expect(summary.diff).toBe(-3000);
  });

  it('devuelve null si la caja se cerró antes de que existiera el arqueo (legacy, sin counted_cash)', () => {
    const session = { expected_cash: null, counted_cash: null, cash_difference: null };
    expect(getArqueoSummary(session)).toBeNull();
  });
});

describe('recalcArqueoOnCorrection (corrección de counted_cash en una caja cerrada)', () => {
  it('recalcula la diferencia al corregir el efectivo contado, sin tocar expected_cash', () => {
    const before = recalcArqueoOnCorrection(50000, 47000);
    expect(before.diff).toBe(-3000);
    expect(before.balanced).toBe(false);
    expect(before.label).toBe('faltante');

    // El cajero corrige el conteo (se equivocó al contar) y ahora sí coincide.
    const corrected = recalcArqueoOnCorrection(50000, 50000);
    expect(corrected.diff).toBe(0);
    expect(corrected.balanced).toBe(true);
    expect(corrected.label).toBe('cuadra');
    expect(corrected.expected).toBe(50000); // expected_cash no cambia con la corrección
  });

  it('una corrección puede pasar de faltante a sobrante si el conteo original estaba mal', () => {
    const corrected = recalcArqueoOnCorrection(50000, 53000);
    expect(corrected.diff).toBe(3000);
    expect(corrected.balanced).toBe(false);
    expect(corrected.label).toBe('sobrante');
  });
});
