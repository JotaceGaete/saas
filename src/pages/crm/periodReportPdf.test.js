import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/supabase', () => ({ supabase: { rpc: vi.fn(), from: vi.fn() } }));

import { buildPeriodReportViewModel, buildPeriodReportFilename, formatDateRangeLabel } from './periodReportPdf';

function baseSummary(overrides = {}) {
  return {
    from: '2026-09-01', to: '2026-09-30',
    sales: {
      available: true, gross: 1000, net: 900, discount: 100, count: 2, avgTicket: 450, unitsSold: 5, voidedCount: 0,
      byChannel: { pos: 500, crmManual: 200, online: 200 },
      topProducts: [{ productId: 'p1', name: 'Producto A', quantity: 3, subtotal: 600 }],
      dailySeries: [{ date: '2026-09-01', net: 900 }, { date: '2026-09-02', net: 0 }],
      activityDays: { daysWithSales: 1, daysWithoutSales: 1, maxDay: { date: '2026-09-01', net: 900 }, minDay: { date: '2026-09-02', net: 0 } },
      pendingGeneratedAvailable: true, pendingGenerated: 0,
    },
    collections: {
      available: true, total: 800,
      byMethod: { cash: 500, card: 0, debit_card: 300, credit_card: 0, bank_transfer: 0, mercado_pago: 0, check: 0, other: 0 },
      vendidoVsCobrado: { available: true, sold: 900, collected: 800, collectedForPeriodSales: 800, collectedForPriorDebt: 0, collectedUnlinked: 0 },
    },
    expenses: { available: true, total: 300, byCategory: { supplies: 200, services: 100 }, cashOutflowsNonExpense: 50 },
    profitability: { available: true, estimatedResult: 600, formula: 'net_sales_minus_expenses', label: 'Saldo antes de costo de mercadería', disclaimer: 'texto disclaimer' },
    cash: { available: true, sessionsCount: 0, closedCount: 0, openCount: 0, sessionsWithDifference: 0, totalDifference: null, totalDifferenceAvailable: false, sessions: [] },
    inventory: { available: true, movementsSummary: { entrada: 1, salida: 2, ajuste: 0 }, topOutflowProducts: [], notableMovements: [], lowStockCount: 0, isLowStockForToday: true },
    alerts: [],
    metadata: { generated_at: '2026-10-01T12:00:00Z', historical_limitations: [], invalid_range: false },
    ...overrides,
  };
}

describe('formatDateRangeLabel', () => {
  it('mismo mes: "1–30 septiembre 2026"', () => {
    expect(formatDateRangeLabel('2026-09-01', '2026-09-30')).toMatch(/1.{1,2}30 septiembre de 2026|1.{1,2}30 septiembre 2026/);
  });

  it('meses distintos incluye ambos meses', () => {
    const label = formatDateRangeLabel('2026-08-16', '2026-09-15');
    expect(label).toMatch(/ago/i);
    expect(label).toMatch(/sep/i);
  });
});

describe('buildPeriodReportFilename', () => {
  it('genera <slug>-informe-YYYY-MM-DD-a-YYYY-MM-DD.pdf', () => {
    expect(buildPeriodReportFilename('Artesellos', '2026-09-01', '2026-09-30')).toBe('artesellos-informe-2026-09-01-a-2026-09-30.pdf');
  });

  it('fallback a "walinka" si el nombre está vacío', () => {
    expect(buildPeriodReportFilename('', '2026-09-01', '2026-09-30')).toBe('walinka-informe-2026-09-01-a-2026-09-30.pdf');
    expect(buildPeriodReportFilename(null, '2026-09-01', '2026-09-30')).toBe('walinka-informe-2026-09-01-a-2026-09-30.pdf');
  });
});

describe('buildPeriodReportViewModel — contrato general', () => {
  it('credit (cuenta corriente) nunca aparece en byMethod', () => {
    const vm = buildPeriodReportViewModel(baseSummary(), null, { currency: 'CLP' }, '2026-09-01', '2026-09-30');
    expect(vm.collections.byMethod.every(m => m.method !== 'credit')).toBe(true);
  });

  it('unavailable != $0: sales no disponible produce message, nunca valores en 0', () => {
    const vm = buildPeriodReportViewModel(baseSummary({ sales: { available: false }, profitability: { available: false } }), null, {}, '2026-09-01', '2026-09-30');
    expect(vm.sales.available).toBe(false);
    expect(vm.sales.message).toBeTruthy();
    expect(vm.sales.net).toBeUndefined();
    expect(vm.profitability.available).toBe(false);
  });

  it('sin comparisonSummary: kpis.*.comparison es null (no se fabrica una comparación)', () => {
    const vm = buildPeriodReportViewModel(baseSummary(), null, {}, '2026-09-01', '2026-09-30');
    expect(vm.kpis.netSales.comparison).toBeNull();
    expect(vm.meta.comparisonRangeLabel).toBeNull();
  });

  it('con comparisonSummary: calcula delta usando computePeriodComparison (estado "normal")', () => {
    const comparison = baseSummary({ from: '2026-08-01', to: '2026-08-31', sales: { available: true, net: 450 } });
    const vm = buildPeriodReportViewModel(baseSummary(), comparison, {}, '2026-09-01', '2026-09-30');
    expect(vm.kpis.netSales.comparison.state).toBe('normal');
    expect(vm.kpis.netSales.comparison.deltaPct).toBeCloseTo(100, 0); // 900 vs 450 = +100%
    expect(vm.meta.comparisonRangeLabel).toBeTruthy();
  });

  it('comparación con período anterior en cero: "no_base", nunca Infinity', () => {
    const comparison = baseSummary({ sales: { available: true, net: 0 } });
    const vm = buildPeriodReportViewModel(baseSummary(), comparison, {}, '2026-09-01', '2026-09-30');
    expect(vm.kpis.netSales.comparison.state).toBe('no_base');
    expect(vm.kpis.netSales.comparison.deltaPct).toBeNull();
  });

  it('comparación con período anterior no disponible: "unavailable"', () => {
    const comparison = baseSummary({ sales: { available: false } });
    const vm = buildPeriodReportViewModel(baseSummary(), comparison, {}, '2026-09-01', '2026-09-30');
    expect(vm.kpis.netSales.comparison.state).toBe('unavailable');
  });

  it('gastos por categoría incluye porcentaje del total', () => {
    const vm = buildPeriodReportViewModel(baseSummary(), null, {}, '2026-09-01', '2026-09-30');
    const supplies = vm.expenses.byCategory.find(c => c.key === 'supplies');
    expect(supplies.pct).toBeCloseTo(66.7, 0);
  });

  it('vendidoVsCobrado se propaga al view-model tal cual (sin recalcular)', () => {
    const vm = buildPeriodReportViewModel(baseSummary(), null, {}, '2026-09-01', '2026-09-30');
    expect(vm.collections.vendidoVsCobrado.available).toBe(true);
    expect(vm.collections.vendidoVsCobrado.collectedForPriorDebt.value).toBe(0);
  });

  it('serie diaria conserva todos los días, incluyendo $0', () => {
    const vm = buildPeriodReportViewModel(baseSummary(), null, {}, '2026-09-01', '2026-09-30');
    expect(vm.sales.dailySeries).toHaveLength(2);
    expect(vm.sales.dailySeries[1].net).toBe(0);
  });
});
