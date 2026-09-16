/**
 * crmService.js — computeComparisonPeriod / computePeriodComparison
 * (REPORTES-PERIODO-1 §2/§4).
 *
 * Funciones PURAS (sin supabase) -- se prueban sin mocking.
 */
import { describe, it, expect, vi } from 'vitest';

// computeComparisonPeriod/computePeriodComparison son funciones puras (sin
// supabase) pero viven en crmService.js, que SÍ instancia un cliente
// supabase a nivel de módulo -- se mockea igual que crmService.dailySummary.test.js
// para poder importar el archivo sin variables de entorno reales.
vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

import { computeComparisonPeriod, computePeriodComparison } from './crmService';

describe('computeComparisonPeriod — regla única: N días inmediatamente anteriores, sin gap', () => {
  it('un solo día (hoy): compara contra el día inmediatamente anterior', () => {
    expect(computeComparisonPeriod('2026-09-16', '2026-09-16')).toEqual({ from: '2026-09-15', to: '2026-09-15', lengthDays: 1 });
  });

  it('"ayer" como rango de un día', () => {
    expect(computeComparisonPeriod('2026-09-15', '2026-09-15')).toEqual({ from: '2026-09-14', to: '2026-09-14', lengthDays: 1 });
  });

  it('mes completo (30 días, septiembre) compara contra los 30 días anteriores (1-31 agosto)', () => {
    const result = computeComparisonPeriod('2026-09-01', '2026-09-30');
    expect(result).toEqual({ from: '2026-08-02', to: '2026-08-31', lengthDays: 30 });
  });

  it('mes PARCIAL en curso (1-16 sep) compara contra los 16 días inmediatamente anteriores, NO contra "1-16 agosto"', () => {
    // Ticket §2: se decidió explícitamente NO usar alineación "mismo día del
    // mes" -- "N días inmediatamente anteriores" es la única regla, para
    // toda longitud de período.
    const result = computeComparisonPeriod('2026-09-01', '2026-09-16');
    expect(result).toEqual({ from: '2026-08-16', to: '2026-08-31', lengthDays: 16 });
  });

  it('rango personalizado de 15 días compara contra los 15 días inmediatamente anteriores (ejemplo textual del ticket)', () => {
    const result = computeComparisonPeriod('2026-09-16', '2026-09-30');
    expect(result.lengthDays).toBe(15);
    expect(result).toEqual({ from: '2026-09-01', to: '2026-09-15', lengthDays: 15 });
  });

  it('últimos 7 días compara contra los 7 días inmediatamente anteriores', () => {
    const result = computeComparisonPeriod('2026-09-10', '2026-09-16');
    expect(result).toEqual({ from: '2026-09-03', to: '2026-09-09', lengthDays: 7 });
  });

  it('cruce de año nuevo: el período anterior cruza correctamente a diciembre del año anterior', () => {
    const result = computeComparisonPeriod('2027-01-01', '2027-01-05');
    expect(result).toEqual({ from: '2026-12-27', to: '2026-12-31', lengthDays: 5 });
  });

  it('límite de mes: 1 marzo (después de febrero, año no bisiesto) retrocede correctamente sobre 28 días de febrero', () => {
    const result = computeComparisonPeriod('2026-03-01', '2026-03-01');
    expect(result).toEqual({ from: '2026-02-28', to: '2026-02-28', lengthDays: 1 });
  });

  it('rango inválido (from > to) retorna null', () => {
    expect(computeComparisonPeriod('2026-09-16', '2026-09-01')).toBeNull();
  });

  it('fechas faltantes retorna null', () => {
    expect(computeComparisonPeriod(null, '2026-09-01')).toBeNull();
    expect(computeComparisonPeriod('2026-09-01', undefined)).toBeNull();
  });
});

describe('computePeriodComparison — nunca Infinity/NaN, sin semántica de bueno/malo', () => {
  it('caso normal: delta % y absoluto correctos', () => {
    const result = computePeriodComparison(8420000, 7810000);
    expect(result.state).toBe('normal');
    expect(result.deltaAbs).toBe(610000);
    expect(result.deltaPct).toBeCloseTo(7.81, 1);
  });

  it('anterior = 0, actual > 0 → "no_base", nunca Infinity', () => {
    const result = computePeriodComparison(5000, 0);
    expect(result.state).toBe('no_base');
    expect(result.deltaPct).toBeNull();
    expect(Number.isFinite(result.deltaPct)).toBe(false); // null, no es un número finito ni Infinity
    expect(result.deltaAbs).toBe(5000);
  });

  it('anterior = 0, actual = 0 → "both_zero", nunca NaN', () => {
    const result = computePeriodComparison(0, 0);
    expect(result.state).toBe('both_zero');
    expect(result.deltaPct).toBeNull();
    expect(result.deltaAbs).toBe(0);
  });

  it('actual = 0, anterior > 0 → caída del 100%, caso normal (no un caso especial)', () => {
    const result = computePeriodComparison(0, 4000);
    expect(result.state).toBe('normal');
    expect(result.deltaPct).toBe(-100);
    expect(result.deltaAbs).toBe(-4000);
  });

  it('período anterior no disponible (null) → "unavailable", nunca se inventa un delta', () => {
    const result = computePeriodComparison(5000, null);
    expect(result.state).toBe('unavailable');
    expect(result.deltaPct).toBeNull();
    expect(result.deltaAbs).toBeNull();
  });

  it('período actual no disponible (null) → "unavailable"', () => {
    const result = computePeriodComparison(null, 5000);
    expect(result.state).toBe('unavailable');
  });

  it('ambos no disponibles → "unavailable"', () => {
    expect(computePeriodComparison(null, null).state).toBe('unavailable');
  });

  it('nunca produce Infinity, -Infinity o NaN bajo ninguna combinación numérica', () => {
    const combos = [[0, 0], [0, 100], [100, 0], [-50, 0], [0, -50], [1e9, 1], [1, 1e9]];
    for (const [cur, prev] of combos) {
      const r = computePeriodComparison(cur, prev);
      expect(Number.isNaN(r.deltaPct) || r.deltaPct === Infinity || r.deltaPct === -Infinity).toBe(false);
    }
  });

  it('gastos: un aumento se reporta con el mismo signo numérico que cualquier otra métrica -- sin polaridad especial en el helper', () => {
    const increase = computePeriodComparison(500000, 400000);
    expect(increase.state).toBe('normal');
    expect(increase.deltaPct).toBeGreaterThan(0);
    // El helper NO decide si esto es "malo" -- no expone ningún campo de
    // tono/color. Eso es responsabilidad exclusiva de la capa de UI.
    expect(increase).not.toHaveProperty('tone');
    expect(increase).not.toHaveProperty('isGood');
  });

  it('saldo antes de costo de mercadería puede ser negativo: denominador usa |anterior|, nunca invierte el signo del delta', () => {
    const result = computePeriodComparison(-1000, -2000); // mejoró (menos negativo)
    expect(result.state).toBe('normal');
    expect(result.deltaAbs).toBe(1000);
    expect(result.deltaPct).toBe(50); // (−1000 − −2000) / |−2000| * 100 = 50%
  });
});
