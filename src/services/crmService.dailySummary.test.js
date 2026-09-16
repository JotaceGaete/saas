/**
 * crmService.js — getDailySummary (RESUMEN-DEL-DIA-1).
 *
 * Mockea supabase.from() con resultados SECUENCIADOS por tabla (un índice
 * de llamada por tabla, no solo por nombre) -- necesario porque
 * getDailySummary reutiliza funciones existentes (getCashDayPayments,
 * getOperatingCostItemsForPeriod, getCashSessionsForDate,
 * getCashSessionReconciliation, getCashSessionPayments,
 * getCashSessionMovements, getCrmStockProducts) que en conjunto pueden
 * consultar la MISMA tabla varias veces con propósitos distintos (p. ej.
 * crm_payments: cobros del día, pagos de una sesión abierta -- vinculados y
 * legacy --, y pagos de facturas pendientes).
 *
 * El foco de estos tests es el CONTRATO de negocio, no los detalles de cada
 * función reutilizada (esas ya tienen su propia cobertura en
 * crmService.test.js).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (...args) => fromMock(...args),
  },
}));

import { getDailySummary } from './crmService';

beforeEach(() => {
  fromMock.mockReset();
});

function queryResult(result) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return () => proxy;
    },
  });
  return proxy;
}

/**
 * @param {Record<string, any | any[]>} map - por tabla: un resultado fijo
 *   (repetido en cada llamada) o un array de resultados (uno por llamada
 *   sucesiva a esa tabla, se repite el último si se agotan).
 */
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

const EMPTY_TABLES = {
  crm_invoices: { data: [], error: null },
  crm_payments: { data: [], error: null },
  crm_cost_items: { data: [], error: null },
  crm_cash_movements: { data: [], error: null },
  crm_cash_sessions: { data: [], error: null },
  wa_products: { data: [], error: null },
  crm_stock_movements: { data: [], error: null },
};

describe('getDailySummary — día sin actividad', () => {
  it('devuelve todo en cero sin alertas', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getDailySummary('biz1', '2026-09-16');

    expect(result.date).toBe('2026-09-16');
    expect(result.sales).toMatchObject({ gross: 0, net: 0, count: 0, avgTicket: 0, unitsSold: 0, voidedCount: 0 });
    expect(result.sales.byHour).toHaveLength(24);
    expect(result.sales.topProducts).toEqual([]);
    expect(result.collections).toMatchObject({ total: 0, pendingToday: 0 });
    expect(result.expenses).toMatchObject({ total: 0, cashOutflowsNonExpense: 0 });
    expect(result.cash.sessions).toEqual([]);
    expect(result.inventory).toMatchObject({ lowStockCount: 0, isLowStockForToday: true });
    expect(result.profitability.estimatedResult).toBe(0);
    expect(result.profitability.formula).toBe('net_sales_minus_expenses');
    expect(result.alerts).toEqual([]);
    expect(result.metadata.is_today).toBe(true);
  });
});

describe('getDailySummary — VENTA vs DINERO RECIBIDO (distinción central)', () => {
  it('venta a crédito (cuenta corriente) suma a sales.net pero NUNCA a collections.total', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{
          id: 'inv-credit', status: 'pendiente', total: 10000, subtotal: 10000, discount_amount: 0,
          source: 'crm', order_id: null, created_at: '2026-09-16T14:00:00-03:00', issue_date: '2026-09-16',
          crm_invoice_items: [{ product_id: 'p1', name: 'Producto A', quantity: 1, subtotal: 10000 }],
        }],
        error: null,
      },
      // Sin cobros efectivos aún -- una venta a crédito no genera un pago 'received'.
      crm_payments: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');

    expect(result.sales.net).toBe(10000);
    expect(result.collections.total).toBe(0);
    expect(result.sales.net).not.toBe(result.collections.total);
    // La factura pendiente sin pagos reales suma a "pendiente de cobro".
    expect(result.collections.pendingToday).toBe(10000);
  });

  it('cobro hoy de una deuda ANTIGUA (payment_date=hoy, invoice.issue_date != hoy) suma a collections.total pero NO a sales.net de hoy', async () => {
    mockTables({
      ...EMPTY_TABLES,
      // Sin facturas EMITIDAS hoy -- la factura que se está pagando fue emitida ayer.
      crm_invoices: { data: [], error: null },
      // getCashDayPayments ya filtra por payment_date, así que esta fila
      // representa un pago de HOY sobre una factura antigua.
      crm_payments: {
        data: [{
          id: 'pay-old-debt', amount: 5000, payment_method: 'cash', payment_status: 'received',
          payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv-old',
        }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');

    expect(result.collections.total).toBe(5000);
    expect(result.sales.net).toBe(0);
    expect(result.sales.net).not.toBe(result.collections.total);
  });

  it('escenario mixto con venta a crédito: sales.net !== collections.total se cumple explícitamente', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [
          {
            id: 'inv-cash', status: 'pagada', total: 3000, subtotal: 3000, discount_amount: 0,
            source: 'pos', order_id: null, created_at: '2026-09-16T10:00:00-03:00', issue_date: '2026-09-16',
            crm_invoice_items: [],
          },
          {
            id: 'inv-credit', status: 'pendiente', total: 7000, subtotal: 7000, discount_amount: 0,
            source: 'crm', order_id: null, created_at: '2026-09-16T11:00:00-03:00', issue_date: '2026-09-16',
            crm_invoice_items: [],
          },
        ],
        error: null,
      },
      crm_payments: {
        data: [{ id: 'pay1', amount: 3000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv-cash' }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');

    expect(result.sales.net).toBe(10000);
    expect(result.collections.total).toBe(3000);
    expect(result.sales.net).not.toBe(result.collections.total);
  });
});

describe('getDailySummary — medios de pago', () => {
  it('venta con débito y venta con crédito de banco se separan de "card" genérico', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_payments: {
        data: [
          { id: 'p1', amount: 1000, payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv1' },
          { id: 'p2', amount: 2000, payment_method: 'credit_card', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv2' },
          { id: 'p3', amount: 500, payment_method: 'mercado_pago', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv3' },
        ],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');

    expect(result.collections.byMethod).toMatchObject({ debit_card: 1000, credit_card: 2000, mercado_pago: 500, cash: 0, card: 0 });
    expect(result.collections.total).toBe(3500);
  });

  it('ventas con medios mixtos en un mismo día se agregan correctamente por método', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_payments: {
        data: [
          { id: 'p1', amount: 1000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv1' },
          { id: 'p2', amount: 1000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv2' },
          { id: 'p3', amount: 2500, payment_method: 'bank_transfer', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv3' },
        ],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');

    expect(result.collections.byMethod.cash).toBe(2000);
    expect(result.collections.byMethod.bank_transfer).toBe(2500);
    expect(result.collections.total).toBe(4500);
  });

  it('un pago anulado (voided_at) no cuenta en collections.total', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_payments: {
        data: [{ id: 'p1', amount: 9999, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: '2026-09-16T12:00:00Z', invoice_id: 'inv1' }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.collections.total).toBe(0);
  });
});

describe('getDailySummary — gastos y egresos', () => {
  it('un gasto (crm_cost_item variable con economicDate=:date) suma a expenses.total por categoría', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cost_items: {
        data: [
          { id: 'c1', type: 'variable', amount: '15000', category: 'supplies', source: 'manual', source_movement_id: null, created_at: '2026-09-16T09:00:00Z' },
        ],
        error: null,
      },
      crm_cash_movements: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.expenses.total).toBe(15000);
    expect(result.expenses.byCategory).toMatchObject({ supplies: 15000 });
  });

  it('un movimiento de caja que NO es gasto (is_expense=false) no aparece en expenses.total, sino en cashOutflowsNonExpense', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cost_items: { data: [], error: null },
      crm_cash_movements: {
        data: [
          { id: 'm1', direction: 'out', amount: 20000, movement_date: '2026-09-16', is_expense: false, voided_at: null, category: 'owner_withdrawal' },
        ],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.expenses.total).toBe(0);
    expect(result.expenses.cashOutflowsNonExpense).toBe(20000);
  });

  it('un movimiento is_expense=true que YA generó un crm_cost_item no se cuenta dos veces', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cost_items: {
        data: [{ id: 'c1', type: 'variable', amount: 8000, category: 'services', source: 'cash_outflow', source_movement_id: 'm1', created_at: '2026-09-10T00:00:00Z' }],
        error: null,
      },
      crm_cash_movements: {
        // getOperatingCostItemsForPeriod consulta crm_cash_movements para el
        // economicDate del ítem vinculado; getCashDayMovements consulta la
        // misma tabla para los movimientos del día -- dos llamadas, mismo
        // resultado fijo (no-array): ambas ven la misma fila.
        data: [{ id: 'm1', movement_date: '2026-09-16', direction: 'out', amount: 8000, is_expense: true, voided_at: null, category: 'services' }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.expenses.total).toBe(8000);
    expect(result.expenses.cashOutflowsNonExpense).toBe(0);
  });
});

describe('getDailySummary — caja y conciliación', () => {
  it('sesión abierta se etiqueta como estimado en vivo, nunca como conciliación definitiva', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: {
        data: [{ id: 'sess-open', status: 'open', opened_at: '2026-09-16T09:00:00-03:00', closed_at: null, initial_amount: 10000 }],
        error: null,
      },
      crm_payments: { data: [], error: null },
      crm_cash_movements: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.cash.sessions).toHaveLength(1);
    expect(result.cash.sessions[0]).toMatchObject({ status: 'open', isLiveEstimate: true, reconciliation: null });
    expect(result.cash.sessions[0].liveEstimate).toBeTruthy();
  });

  it('sesión cerrada CON snapshot persistido pasa el arqueo verbatim, sin recalcularlo', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: {
        data: [{ id: 'sess-closed', status: 'closed', opened_at: '2026-09-16T09:00:00-03:00', closed_at: '2026-09-16T20:00:00-03:00', initial_amount: 10000 }],
        error: null,
      },
      crm_cash_session_reconciliations: {
        data: [{ id: 'r1', session_id: 'sess-closed', payment_method: 'cash', expected_amount: 50000, reconciled_amount: 48000, difference: -2000 }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.cash.sessions[0].isLiveEstimate).toBe(false);
    expect(result.cash.sessions[0].reconciliation).toEqual([
      { id: 'r1', session_id: 'sess-closed', payment_method: 'cash', expected_amount: 50000, reconciled_amount: 48000, difference: -2000 },
    ]);
    // Diferencia != 0 en un arqueo persistido dispara una alerta.
    expect(result.alerts).toContainEqual(expect.objectContaining({ type: 'cash_difference' }));
  });

  it('sesión cerrada SIN snapshot (legacy) se distingue como "sin arqueo registrado" (reconciliation=null, no [])', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: {
        data: [{ id: 'sess-legacy', status: 'closed', opened_at: '2026-09-16T09:00:00-03:00', closed_at: '2026-09-16T20:00:00-03:00', initial_amount: 10000 }],
        error: null,
      },
      crm_cash_session_reconciliations: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.cash.sessions[0].reconciliation).toBeNull();
  });

  it('múltiples sesiones el mismo día se reportan todas, cada una con su propio estado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: {
        data: [
          { id: 'sess-2', status: 'open', opened_at: '2026-09-16T15:00:00-03:00', closed_at: null, initial_amount: 5000 },
          { id: 'sess-1', status: 'closed', opened_at: '2026-09-16T09:00:00-03:00', closed_at: '2026-09-16T14:00:00-03:00', initial_amount: 10000 },
        ],
        error: null,
      },
      crm_cash_session_reconciliations: { data: [], error: null },
      crm_payments: { data: [], error: null },
      crm_cash_movements: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.cash.sessions).toHaveLength(2);
    expect(result.cash.sessions.map(s => s.id).sort()).toEqual(['sess-1', 'sess-2']);
  });
});

describe('getDailySummary — caja abierta: efectivo esperado SOLO cuenta efectivo físico', () => {
  const openSession = {
    id: 'sess-open', status: 'open', opened_at: '2026-09-16T09:00:00-03:00', closed_at: null, initial_amount: 20000,
  };

  it('fondo inicial 20.000 + cash 10.000 + debit_card 50.000 => efectivo esperado = 30.000, NO 80.000', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: { data: [openSession], error: null },
      crm_payments: {
        data: [
          { id: 'p-cash', invoice_id: null, amount: 10000, currency: 'CLP', payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T10:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
          { id: 'p-debit', invoice_id: null, amount: 50000, currency: 'CLP', payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T11:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
        ],
        error: null,
      },
      crm_cash_movements: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    const live = result.cash.sessions[0].liveEstimate;
    expect(live.cashReceived).toBe(10000);
    expect(live.expectedCash).toBe(30000);
    expect(live.expectedCash).not.toBe(80000);
    // Se informa por separado, pero NO altera el efectivo físico.
    expect(live.receivedByMethod.debit_card).toBe(50000);
    expect(live.totalReceivedAllMethods).toBe(60000);
  });

  it('un movimiento manual cash direction=in AUMENTA el efectivo esperado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: { data: [openSession], error: null },
      crm_payments: { data: [], error: null },
      crm_cash_movements: {
        data: [{ id: 'm-in', session_id: 'sess-open', direction: 'in', amount: 5000, payment_method: 'cash', voided_at: null, movement_date: '2026-09-16' }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    const live = result.cash.sessions[0].liveEstimate;
    expect(live.cashManualIn).toBe(5000);
    expect(live.expectedCash).toBe(25000); // 20000 inicial + 5000 in
  });

  it('un movimiento manual cash direction=out DISMINUYE el efectivo esperado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: { data: [openSession], error: null },
      crm_payments: { data: [], error: null },
      crm_cash_movements: {
        data: [{ id: 'm-out', session_id: 'sess-open', direction: 'out', amount: 5000, payment_method: 'cash', voided_at: null, movement_date: '2026-09-16' }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    const live = result.cash.sessions[0].liveEstimate;
    expect(live.cashOutflow).toBe(5000);
    expect(live.expectedCash).toBe(15000); // 20000 inicial - 5000 out
  });

  it('un movimiento manual NO-cash no altera el efectivo esperado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: { data: [openSession], error: null },
      crm_payments: { data: [], error: null },
      crm_cash_movements: {
        data: [
          { id: 'm-in-card', session_id: 'sess-open', direction: 'in', amount: 5000, payment_method: 'card', voided_at: null, movement_date: '2026-09-16' },
          { id: 'm-out-card', session_id: 'sess-open', direction: 'out', amount: 3000, payment_method: 'bank_transfer', voided_at: null, movement_date: '2026-09-16' },
        ],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    const live = result.cash.sessions[0].liveEstimate;
    expect(live.cashManualIn).toBe(0);
    expect(live.cashOutflow).toBe(0);
    expect(live.expectedCash).toBe(20000); // sin cambios -- solo fondo inicial
  });

  it('débito/crédito/Mercado Pago se informan por separado (receivedByMethod) pero nunca alteran el efectivo físico', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      crm_cash_sessions: { data: [openSession], error: null },
      crm_payments: {
        data: [
          { id: 'p-credit-card', invoice_id: null, amount: 15000, payment_method: 'credit_card', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T10:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
          { id: 'p-mp', invoice_id: null, amount: 7000, payment_method: 'mercado_pago', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T10:05:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
        ],
        error: null,
      },
      crm_cash_movements: { data: [], error: null },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    const live = result.cash.sessions[0].liveEstimate;
    expect(live.expectedCash).toBe(20000); // solo fondo inicial -- nada de esto es efectivo
    expect(live.receivedByMethod.credit_card).toBe(15000);
    expect(live.receivedByMethod.mercado_pago).toBe(7000);
    expect(live.cashReceived).toBe(0);
  });
});

describe('getDailySummary — inventario', () => {
  it('cuenta productos con stock_actual <= stock_minimo como stock bajo', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: [], error: null },
      wa_products: {
        data: [
          { id: 'p1', name: 'A', stock_actual: 2, stock_minimo: 5 },
          { id: 'p2', name: 'B', stock_actual: 10, stock_minimo: 5 },
          { id: 'p3', name: 'C', stock_actual: 0, stock_minimo: 3 },
          { id: 'p4', name: 'D', stock_actual: null, stock_minimo: 5 },
        ],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.inventory.lowStockCount).toBe(2);
    expect(result.alerts).toContainEqual(expect.objectContaining({ type: 'low_stock' }));
  });
});

describe('getDailySummary — fecha histórica (no hoy)', () => {
  it('marca metadata.is_today=false y documenta las limitaciones históricas conocidas', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getDailySummary('biz1', '2020-01-01');

    expect(result.metadata.is_today).toBe(false);
    expect(result.inventory.isLowStockForToday).toBe(false);
    expect(result.metadata.historical_limitations.length).toBeGreaterThan(0);
    expect(result.metadata.historical_limitations.some(msg => /stock/i.test(msg))).toBe(true);
  });
});

describe('getDailySummary — top productos y unidades vendidas', () => {
  it('agrega unidades y ranquea productos más vendidos por cantidad', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{
          id: 'inv1', status: 'pagada', total: 5000, subtotal: 5000, discount_amount: 0,
          source: 'pos', order_id: null, created_at: '2026-09-16T10:00:00-03:00', issue_date: '2026-09-16',
          crm_invoice_items: [
            { product_id: 'p1', name: 'Pan', quantity: 10, subtotal: 3000 },
            { product_id: 'p2', name: 'Leche', quantity: 3, subtotal: 2000 },
          ],
        }],
        error: null,
      },
    });

    const result = await getDailySummary('biz1', '2026-09-16');
    expect(result.sales.unitsSold).toBe(13);
    expect(result.sales.topProducts[0]).toMatchObject({ name: 'Pan', quantity: 10 });
  });
});
