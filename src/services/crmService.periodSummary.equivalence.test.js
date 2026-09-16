/**
 * crmService.js — EQUIVALENCIA getPeriodSummary(biz, D, D) vs getDailySummary(biz, D)
 * (REPORTES-PERIODO-1 §29 -- "ESTE ES UNO DE LOS TESTS MÁS IMPORTANTES").
 *
 * El mismo dataset mockeado se alimenta a AMBAS funciones para un rango de
 * un solo día. Deben coincidir campo a campo en:
 *   ventas netas, dinero recibido, gastos, saldo antes de costo de
 *   mercadería, número de ventas, ticket promedio, unidades, medios de
 *   pago, canales.
 *
 * Se mantiene el dataset sin sesiones de caja (crm_cash_sessions vacío) para
 * poder alimentar la MISMA secuencia de resultados por tabla a ambas
 * funciones sin tener que replicar la coreografía interna de consultas de
 * cada una (que difiere en el orden exacto de llamadas auxiliares aunque el
 * resultado sea idéntico) -- caja/conciliación NO está en la lista de campos
 * que el ticket exige comparar explícitamente, y ya tiene su propia
 * cobertura dedicada en crmService.periodSummary.test.js y
 * crmService.dailySummary.test.js (ambas reutilizan literalmente las mismas
 * funciones getCashSessionPayments/getCashSessionMovements/
 * getCashSessionReconciliation, así que no hay un segundo motor que pueda
 * divergir).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn(), from: (...args) => fromMock(...args) },
}));

import { getDailySummary, getPeriodSummary } from './crmService';

function queryResult(result) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}

function mockTables(map) {
  const counters = {};
  fromMock.mockImplementation((table) => {
    if (!(table in map)) throw new Error(`tabla inesperada en el test: ${table}`);
    const entry = map[table];
    if (!Array.isArray(entry)) return queryResult(entry);
    const idx = counters[table] || 0;
    counters[table] = idx + 1;
    return queryResult(entry[Math.min(idx, entry.length - 1)]);
  });
}

const DATE = '2026-09-16';

// Dataset rico: ventas por los 3 canales, una venta a crédito (cuenta
// corriente), una anulada, líneas de producto reales, cobros con varios
// medios (incluyendo 'card' legacy), un gasto variable y un egreso de caja
// que NO es gasto, productos con stock bajo, y movimientos de inventario.
function buildDataset() {
  return {
    crm_invoices: {
      data: [
        {
          id: 'inv-pos', status: 'pagada', total: 9500, subtotal: 10000, discount_amount: 500, source: 'pos', order_id: null,
          created_at: `${DATE}T10:00:00-03:00`, issue_date: DATE,
          crm_invoice_items: [{ product_id: 'p1', name: 'Automatik 945', quantity: 2, subtotal: 9500 }],
        },
        {
          id: 'inv-online', status: 'pagada', total: 3000, subtotal: 3000, discount_amount: 0, source: 'crm', order_id: 'order-xyz',
          created_at: `${DATE}T11:00:00-03:00`, issue_date: DATE,
          crm_invoice_items: [{ product_id: 'p2', name: 'TRAXX 9012', quantity: 1, subtotal: 3000 }],
        },
        {
          id: 'inv-credit', status: 'pendiente', total: 7000, subtotal: 7000, discount_amount: 0, source: 'crm', order_id: null,
          created_at: `${DATE}T12:00:00-03:00`, issue_date: DATE,
          crm_invoice_items: [{ product_id: 'p1', name: 'Automatik 945', quantity: 1, subtotal: 7000 }],
        },
        {
          id: 'inv-voided', status: 'anulada', total: 99999, subtotal: 99999, discount_amount: 0, source: 'crm', order_id: null,
          created_at: `${DATE}T13:00:00-03:00`, issue_date: DATE,
          crm_invoice_items: [],
        },
      ],
      error: null,
    },
    crm_payments: {
      data: [
        { id: 'pay1', amount: 9500, payment_method: 'cash', payment_status: 'received', payment_date: DATE, voided_at: null, invoice_id: 'inv-pos' },
        { id: 'pay2', amount: 3000, payment_method: 'card', payment_status: 'received', payment_date: DATE, voided_at: null, invoice_id: 'inv-online' },
        { id: 'pay3', amount: 2000, payment_method: 'mercado_pago', payment_status: 'received', payment_date: DATE, voided_at: null, invoice_id: null },
        { id: 'pay-voided', amount: 55555, payment_method: 'cash', payment_status: 'received', payment_date: DATE, voided_at: `${DATE}T18:00:00Z`, invoice_id: null },
      ],
      error: null,
    },
    crm_cost_items: {
      data: [
        { id: 'c1', type: 'variable', amount: 1500, category: 'supplies', source: 'manual', source_movement_id: null, created_at: `${DATE}T09:00:00Z`, month: 9, year: 2026 },
      ],
      error: null,
    },
    crm_cash_movements: {
      data: [
        { id: 'm1', direction: 'out', amount: 4000, movement_date: DATE, is_expense: false, voided_at: null, category: 'owner_withdrawal' },
      ],
      error: null,
    },
    crm_cash_sessions: { data: [], error: null },
    wa_products: { data: [{ id: 'p1', stock_actual: 2, stock_minimo: 5 }, { id: 'p2', stock_actual: 40, stock_minimo: 5 }], error: null },
    crm_stock_movements: {
      data: [{ id: 'sm1', product_id: 'p1', type: 'salida', quantity: -3, notes: null, created_at: `${DATE}T14:00:00Z`, wa_products: { name: 'Automatik 945' } }],
      error: null,
    },
  };
}

describe('EQUIVALENCIA — getPeriodSummary(biz, D, D) === getDailySummary(biz, D)', () => {
  let daily;
  let period;

  beforeEach(async () => {
    mockTables(buildDataset());
    daily = await getDailySummary('biz1', DATE);
    fromMock.mockReset();
    mockTables(buildDataset());
    period = await getPeriodSummary('biz1', DATE, DATE);
  });

  it('ventas netas coinciden', () => {
    expect(period.sales.net).toBe(daily.sales.net);
  });

  it('dinero recibido (total) coincide', () => {
    expect(period.collections.total).toBe(daily.collections.total);
  });

  it('gastos registrados coinciden', () => {
    expect(period.expenses.total).toBe(daily.expenses.total);
  });

  it('saldo antes de costo de mercadería coincide', () => {
    expect(period.profitability.estimatedResult).toBe(daily.profitability.estimatedResult);
    expect(period.profitability.available).toBe(daily.profitability.available);
  });

  it('número de ventas coincide', () => {
    expect(period.sales.count).toBe(daily.sales.count);
  });

  it('ticket promedio coincide', () => {
    expect(period.sales.avgTicket).toBe(daily.sales.avgTicket);
  });

  it('unidades vendidas coinciden', () => {
    expect(period.sales.unitsSold).toBe(daily.sales.unitsSold);
  });

  it('medios de pago coinciden exactamente (todos los métodos, incluyendo "card" legacy)', () => {
    expect(period.collections.byMethod).toEqual(daily.collections.byMethod);
  });

  it('canales de venta coinciden (TPV/online/CRM manual)', () => {
    expect(period.sales.byChannel).toEqual(daily.sales.byChannel);
  });

  it('ventas brutas y descuentos también coinciden (no exigido explícitamente por el ticket, pero deben cuadrar)', () => {
    expect(period.sales.gross).toBe(daily.sales.gross);
    expect(period.sales.discount).toBe(daily.sales.discount);
  });

  it('ventas anuladas se excluyen igual en ambos (voidedCount coincide)', () => {
    expect(period.sales.voidedCount).toBe(daily.sales.voidedCount);
  });

  it('egresos de caja que no son gasto coinciden (cashOutflowsNonExpense)', () => {
    expect(period.expenses.cashOutflowsNonExpense).toBe(daily.expenses.cashOutflowsNonExpense);
  });

  it('lowStockCount (stock actual) coincide', () => {
    expect(period.inventory.lowStockCount).toBe(daily.inventory.lowStockCount);
  });

  it('movimientos de inventario del día coinciden', () => {
    expect(period.inventory.movementsSummary).toEqual(daily.inventory.movementsSummary);
  });

  it('sanity check del propio dataset: la venta a crédito prueba que sales.net !== collections.total en ambos', () => {
    // inv-credit (7000, status pendiente) no genera collections -- confirma
    // que ambos módulos aplican la MISMA distinción venta vs cobro.
    expect(daily.sales.net).not.toBe(daily.collections.total);
    expect(period.sales.net).not.toBe(period.collections.total);
    expect(daily.sales.net).toBe(period.sales.net);
  });
});

describe('EQUIVALENCIA — día sin actividad', () => {
  it('ambos devuelven ceros idénticos para el mismo día vacío', async () => {
    const empty = {
      crm_invoices: { data: [], error: null },
      crm_payments: { data: [], error: null },
      crm_cost_items: { data: [], error: null },
      crm_cash_movements: { data: [], error: null },
      crm_cash_sessions: { data: [], error: null },
      wa_products: { data: [], error: null },
      crm_stock_movements: { data: [], error: null },
    };
    mockTables(empty);
    const daily = await getDailySummary('biz1', DATE);
    fromMock.mockReset();
    mockTables(empty);
    const period = await getPeriodSummary('biz1', DATE, DATE);

    expect(period.sales.net).toBe(daily.sales.net);
    expect(period.collections.total).toBe(daily.collections.total);
    expect(period.expenses.total).toBe(daily.expenses.total);
    expect(period.profitability.estimatedResult).toBe(daily.profitability.estimatedResult);
    expect(period.sales.count).toBe(daily.sales.count);
    expect(period.sales.avgTicket).toBe(daily.sales.avgTicket);
    expect(period.sales.unitsSold).toBe(daily.sales.unitsSold);
    expect(period.collections.byMethod).toEqual(daily.collections.byMethod);
    expect(period.sales.byChannel).toEqual(daily.sales.byChannel);
  });
});

describe('EQUIVALENCIA — datos no disponibles (available != $0) en ambos', () => {
  it('si la consulta de ventas falla, ambos reportan available=false y NUNCA $0', async () => {
    const failing = {
      crm_invoices: { data: null, error: new Error('boom') },
      crm_payments: { data: [], error: null },
      crm_cost_items: { data: [], error: null },
      crm_cash_movements: { data: [], error: null },
      crm_cash_sessions: { data: [], error: null },
      wa_products: { data: [], error: null },
      crm_stock_movements: { data: [], error: null },
    };
    mockTables(failing);
    const daily = await getDailySummary('biz1', DATE);
    fromMock.mockReset();
    mockTables(failing);
    const period = await getPeriodSummary('biz1', DATE, DATE);

    expect(daily.sales.available).toBe(false);
    expect(period.sales.available).toBe(false);
    expect(daily.sales.net).toBeNull();
    expect(period.sales.net).toBeNull();
    expect(daily.profitability.available).toBe(false);
    expect(period.profitability.available).toBe(false);
  });
});
