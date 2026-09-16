/**
 * resumenDiaPdf.test.js — RESUMEN-DEL-DIA-2.
 *
 * El objetivo central de este ticket es probar que el view-model de
 * impresión/PDF NUNCA diverge del `summary` real que produce getDailySummary
 * -- no solo que exista un botón. Por eso cada escenario acá llama a la
 * función REAL getDailySummary (con supabase mockeado, mismo patrón que
 * crmService.dailySummary.test.js) y luego alimenta ese `summary` real a
 * buildResumenDiaPdfViewModel, comparando 1:1 (===) contra los campos de
 * `summary` -- nunca valores re-derivados a mano en el test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (...args) => fromMock(...args),
  },
}));

import { getDailySummary, PAYMENT_METHOD_LABELS } from '../../services/crmService';
import { buildResumenDiaPdfViewModel, buildResumenDiaPdfFilename, getResumenDiaHeaderActionSlots } from './resumenDiaPdf';
import { formatMoney } from '../../utils/formatMoney';

beforeEach(() => {
  fromMock.mockReset();
});

// ─── Mismos helpers que crmService.dailySummary.test.js (replicados acá a
// propósito, ver nota en el ticket, para no acoplar los dos archivos de test) ──
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

const EMPTY_TABLES = {
  crm_invoices: { data: [], error: null },
  crm_payments: { data: [], error: null },
  crm_cost_items: { data: [], error: null },
  crm_cash_movements: { data: [], error: null },
  crm_cash_sessions: { data: [], error: null },
  wa_products: { data: [], error: null },
  crm_stock_movements: { data: [], error: null },
};

const BIZ = { businessName: 'Café Ñuñoa & Co.', currency: 'CLP', logoUrl: null };

describe('buildResumenDiaPdfViewModel — informe normal (actividad mixta)', () => {
  it('cada número del view-model traza 1:1 contra el summary real', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [
          {
            id: 'inv1', status: 'pagada', total: 5000, subtotal: 5500, discount_amount: 500,
            source: 'pos', order_id: null, created_at: '2026-09-16T10:00:00-03:00', issue_date: '2026-09-16',
            crm_invoice_items: [{ product_id: 'p1', name: 'Pan', quantity: 10, subtotal: 3000 }],
          },
          {
            id: 'inv2', status: 'anulada', total: 1000, subtotal: 1000, discount_amount: 0,
            source: 'crm', order_id: null, created_at: '2026-09-16T11:00:00-03:00', issue_date: '2026-09-16',
            crm_invoice_items: [],
          },
        ],
        error: null,
      },
      crm_payments: {
        data: [{ id: 'pay1', amount: 5000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv1' }],
        error: null,
      },
      crm_cost_items: {
        data: [{ id: 'c1', type: 'variable', amount: 1500, category: 'supplies', source: 'manual', source_movement_id: null, created_at: '2026-09-16T09:00:00Z' }],
        error: null,
      },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    expect(vm.sales.available).toBe(true);
    expect(vm.sales.net.value).toBe(summary.sales.net);
    expect(vm.sales.gross.value).toBe(summary.sales.gross);
    expect(vm.sales.discount.value).toBe(summary.sales.discount);
    expect(vm.sales.count).toBe(summary.sales.count);
    expect(vm.sales.avgTicket.value).toBe(summary.sales.avgTicket);
    expect(vm.sales.unitsSold).toBe(summary.sales.unitsSold);
    expect(vm.sales.voidedCount).toBe(summary.sales.voidedCount);
    expect(vm.sales.net.formatted).toBe(formatMoney(summary.sales.net, 'CLP'));

    const posChannel = vm.sales.byChannel.find(c => c.key === 'pos');
    expect(posChannel.value).toBe(summary.sales.byChannel.pos);

    expect(vm.sales.topProducts[0].name).toBe(summary.sales.topProducts[0].name);
    expect(vm.sales.topProducts[0].quantity).toBe(summary.sales.topProducts[0].quantity);
    expect(vm.sales.topProducts[0].value).toBe(summary.sales.topProducts[0].subtotal);

    expect(vm.collections.available).toBe(true);
    expect(vm.collections.total.value).toBe(summary.collections.total);
    const cashRow = vm.collections.byMethod.find(m => m.method === 'cash');
    expect(cashRow.value).toBe(summary.collections.byMethod.cash);
    expect(cashRow.label).toBe(PAYMENT_METHOD_LABELS.cash);

    expect(vm.expenses.available).toBe(true);
    expect(vm.expenses.total.value).toBe(summary.expenses.total);
    expect(vm.expenses.cashOutflowsNonExpense.value).toBe(summary.expenses.cashOutflowsNonExpense);
    const suppliesRow = vm.expenses.byCategory.find(c => c.key === 'supplies');
    expect(suppliesRow.value).toBe(summary.expenses.byCategory.supplies);

    expect(vm.profitability.available).toBe(true);
    expect(vm.profitability.value).toBe(summary.profitability.estimatedResult);
    expect(vm.profitability.disclaimer).toBe(summary.profitability.disclaimer);
  });
});

describe('buildResumenDiaPdfViewModel — día sin actividad', () => {
  it('todas las secciones disponibles, todo en cero, ninguna alerta', async () => {
    mockTables(EMPTY_TABLES);
    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    expect(vm.sales.available).toBe(true);
    expect(vm.sales.net.value).toBe(0);
    expect(vm.sales.net.value).toBe(summary.sales.net);
    expect(vm.collections.total.value).toBe(summary.collections.total);
    expect(vm.collections.byMethod).toEqual([]);
    expect(vm.expenses.total.value).toBe(summary.expenses.total);
    expect(vm.expenses.byCategory).toEqual([]);
    expect(vm.cash.sessions).toEqual([]);
    expect(vm.alerts).toEqual([]);
  });
});

describe('buildResumenDiaPdfViewModel — caja abierta (PR #72: solo efectivo físico)', () => {
  it('expectedCash del view-model = liveEstimate.expectedCash del summary; medios no-cash aparecen aparte, nunca sumados', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 'sess-open', status: 'open', opened_at: '2026-09-16T09:00:00-03:00', closed_at: null, initial_amount: 20000 }],
        error: null,
      },
      crm_payments: {
        data: [
          { id: 'p-cash', invoice_id: null, amount: 10000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T10:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
          { id: 'p-debit', invoice_id: null, amount: 50000, payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-16', created_at: '2026-09-16T11:00:00-03:00', voided_at: null, cash_session_id: 'sess-open' },
        ],
        error: null,
      },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    const session = vm.cash.sessions[0];
    const rawSession = summary.cash.sessions[0];
    expect(session.isLiveEstimate).toBe(true);
    expect(session.liveEstimate.expectedCash.value).toBe(rawSession.liveEstimate.expectedCash);
    expect(session.liveEstimate.expectedCash.value).toBe(30000);
    expect(session.liveEstimate.expectedCash.value).not.toBe(80000);

    const debitRow = session.liveEstimate.receivedByMethod.find(m => m.method === 'debit_card');
    expect(debitRow.value).toBe(rawSession.liveEstimate.receivedByMethod.debit_card);
    expect(debitRow.value).toBe(50000);
    // El medio no-cash nunca se suma al efectivo esperado.
    expect(session.liveEstimate.expectedCash.value).not.toBe(
      rawSession.liveEstimate.expectedCash + rawSession.liveEstimate.receivedByMethod.debit_card,
    );
  });
});

describe('buildResumenDiaPdfViewModel — caja cerrada conciliada', () => {
  it('las filas Esperado/Conciliado/Diferencia son el arqueo persistido verbatim, no recalculado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 'sess-closed', status: 'closed', opened_at: '2026-09-16T09:00:00-03:00', closed_at: '2026-09-16T20:00:00-03:00', initial_amount: 10000 }],
        error: null,
      },
      crm_cash_session_reconciliations: {
        data: [
          { id: 'r1', session_id: 'sess-closed', payment_method: 'cash', expected_amount: 50000, reconciled_amount: 48000, difference: -2000 },
          { id: 'r2', session_id: 'sess-closed', payment_method: 'debit_card', expected_amount: 12000, reconciled_amount: 12000, difference: 0 },
        ],
        error: null,
      },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    const session = vm.cash.sessions[0];
    const rawRows = summary.cash.sessions[0].reconciliation;
    expect(session.reconciliation).toHaveLength(rawRows.length);
    session.reconciliation.forEach((row, i) => {
      expect(row.expected.value).toBe(rawRows[i].expected_amount);
      expect(row.reconciled.value).toBe(rawRows[i].reconciled_amount);
      expect(row.difference.value).toBe(rawRows[i].difference);
      expect(row.method).toBe(rawRows[i].payment_method);
    });
  });
});

describe('buildResumenDiaPdfViewModel — múltiples sesiones de caja el mismo día', () => {
  it('reporta todas las sesiones, cada una con su propio estado', async () => {
    mockTables({
      ...EMPTY_TABLES,
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

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    expect(vm.cash.sessions).toHaveLength(2);
    expect(vm.cash.sessions.map(s => s.id).sort()).toEqual(summary.cash.sessions.map(s => s.id).sort());
  });
});

describe('buildResumenDiaPdfViewModel — pagos cash + debit_card + credit_card + mercado_pago', () => {
  it('cada método aparece como fila separada, ninguno mezclado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_payments: {
        data: [
          { id: 'p1', amount: 1000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv1' },
          { id: 'p2', amount: 2000, payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv2' },
          { id: 'p3', amount: 3000, payment_method: 'credit_card', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv3' },
          { id: 'p4', amount: 4000, payment_method: 'mercado_pago', payment_status: 'received', payment_date: '2026-09-16', voided_at: null, invoice_id: 'inv4' },
        ],
        error: null,
      },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    const methods = vm.collections.byMethod.map(m => m.method).sort();
    expect(methods).toEqual(['cash', 'credit_card', 'debit_card', 'mercado_pago'].sort());
    for (const row of vm.collections.byMethod) {
      expect(row.value).toBe(summary.collections.byMethod[row.method]);
    }
    expect(vm.collections.total.value).toBe(10000);
    expect(vm.collections.total.value).toBe(summary.collections.total);
  });
});

describe('buildResumenDiaPdfViewModel — venta a cuenta corriente (credit)', () => {
  it('nunca aparece como fila en el desglose de dinero recibido', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{
          id: 'inv-credit', status: 'pendiente', total: 10000, subtotal: 10000, discount_amount: 0,
          source: 'crm', order_id: null, created_at: '2026-09-16T14:00:00-03:00', issue_date: '2026-09-16',
          crm_invoice_items: [],
        }],
        error: null,
      },
      crm_payments: { data: [], error: null },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    expect(vm.collections.byMethod.find(m => m.method === 'credit')).toBeUndefined();
    expect(vm.collections.total.value).toBe(0);
    expect(vm.sales.net.value).toBe(10000);
    expect(vm.collections.pendingTodayAvailable).toBe(true);
    expect(vm.collections.pendingToday.value).toBe(summary.collections.pendingToday);
  });
});

describe('buildResumenDiaPdfViewModel — gasto vs. movimiento de caja que no es gasto', () => {
  it('no se suman en un solo total de gastos (mismo discriminador is_expense)', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cost_items: {
        data: [{ id: 'c1', type: 'variable', amount: 15000, category: 'supplies', source: 'manual', source_movement_id: null, created_at: '2026-09-16T09:00:00Z' }],
        error: null,
      },
      crm_cash_movements: {
        data: [{ id: 'm1', direction: 'out', amount: 20000, movement_date: '2026-09-16', is_expense: false, voided_at: null, category: 'owner_withdrawal' }],
        error: null,
      },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    expect(vm.expenses.total.value).toBe(15000);
    expect(vm.expenses.total.value).toBe(summary.expenses.total);
    expect(vm.expenses.cashOutflowsNonExpense.value).toBe(20000);
    expect(vm.expenses.cashOutflowsNonExpense.value).toBe(summary.expenses.cashOutflowsNonExpense);
    // Son dos campos separados en el view-model (nunca un único "total"
    // combinado) -- exactamente como en `summary`, que ya distingue
    // expenses.total de expenses.cashOutflowsNonExpense.
    expect(vm.expenses.total.value).not.toBe(vm.expenses.cashOutflowsNonExpense.value);
  });
});

describe('buildResumenDiaPdfViewModel — sección no disponible (available:false)', () => {
  it('marca la sección como no disponible y NUNCA formatea un "$0"', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: { data: null, error: { message: 'conexión perdida' } },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    expect(summary.sales.available).toBe(false);
    expect(vm.sales.available).toBe(false);
    expect(vm.sales.message).toBeTruthy();
    expect(vm.sales).not.toHaveProperty('net');
    expect(vm.profitability.available).toBe(false);
    expect(vm.profitability.formatted).toBeUndefined();
  });

  it('sesión abierta con liveEstimate no disponible se marca sin formatear "$0"', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 'sess-open', status: 'open', opened_at: '2026-09-16T09:00:00-03:00', closed_at: null, initial_amount: 20000 }],
        error: null,
      },
      crm_payments: { data: null, error: { message: 'timeout' } },
    });

    const summary = await getDailySummary('biz1', '2026-09-16');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2026-09-16');

    const session = vm.cash.sessions[0];
    expect(session.liveEstimateUnavailable).toBe(true);
    expect(session.liveEstimate).toBeNull();
    expect(session.message).toBeTruthy();
  });
});

describe('buildResumenDiaPdfViewModel — fecha histórica (no hoy)', () => {
  it('conserva las limitaciones históricas y los flags de vigencia del summary', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 'sess-open', status: 'open', opened_at: '2020-01-01T09:00:00-03:00', closed_at: null, initial_amount: 1000 }],
        error: null,
      },
      crm_payments: { data: [], error: null },
      crm_cash_movements: { data: [], error: null },
    });

    const summary = await getDailySummary('biz1', '2020-01-01');
    const vm = buildResumenDiaPdfViewModel(summary, BIZ, '2020-01-01');

    expect(vm.meta.isToday).toBe(false);
    expect(vm.meta.isToday).toBe(summary.metadata.is_today);
    expect(vm.meta.historicalLimitations).toEqual(summary.metadata.historical_limitations);
    expect(vm.meta.historicalLimitations.length).toBeGreaterThan(0);
    expect(vm.inventory.isLowStockForToday).toBe(summary.inventory.isLowStockForToday);
    expect(vm.inventory.isLowStockForToday).toBe(false);
    expect(vm.cash.sessions[0].isLiveEstimate).toBe(summary.cash.sessions[0].isLiveEstimate);
  });
});

describe('buildResumenDiaPdfFilename', () => {
  it('nombre normal', () => {
    expect(buildResumenDiaPdfFilename('Café Central', '2026-09-16')).toBe('cafe-central-resumen-2026-09-16.pdf');
  });

  it('nombre con acentos y ñ', () => {
    expect(buildResumenDiaPdfFilename('Café Ñuñoa & Co.', '2026-09-16')).toBe('cafe-nunoa-co-resumen-2026-09-16.pdf');
  });

  it('nombre vacío/nulo → fallback walinka', () => {
    expect(buildResumenDiaPdfFilename('', '2026-09-16')).toBe('walinka-resumen-2026-09-16.pdf');
    expect(buildResumenDiaPdfFilename(null, '2026-09-16')).toBe('walinka-resumen-2026-09-16.pdf');
    expect(buildResumenDiaPdfFilename(undefined, '2026-09-16')).toBe('walinka-resumen-2026-09-16.pdf');
  });

  it('nombre que sanitiza a nada (solo símbolos) → fallback walinka', () => {
    expect(buildResumenDiaPdfFilename('!!!###***', '2026-09-16')).toBe('walinka-resumen-2026-09-16.pdf');
  });

  it('nombre con caracteres especiales se sanitiza', () => {
    expect(buildResumenDiaPdfFilename('Mini Market S.A. (Local #2)', '2026-09-16')).toBe('mini-market-s-a-local-2-resumen-2026-09-16.pdf');
  });

  it('usa el sufijo YYYY-MM-DD de la fecha dada', () => {
    expect(buildResumenDiaPdfFilename('Test', '2025-01-05')).toBe('test-resumen-2025-01-05.pdf');
  });
});

describe('getResumenDiaHeaderActionSlots — un solo <PDFDownloadLink> montado a la vez', () => {
  // PanelHeader monta `children` y `mobileActions` simultáneamente (solo
  // alterna cuál se ve por CSS `hidden lg:flex` / `lg:hidden`) -- nunca
  // desmonta el otro. reportActions incluye un <PDFDownloadLink>, que genera
  // el PDF al montarse: pasarlo a ambos props produce dos generadores
  // activos en simultáneo. Esta función es la que garantiza un único slot.
  const actions = { marker: 'reportActions' };

  it('en móvil: el slot activo es mobileActions, children queda null', () => {
    const slots = getResumenDiaHeaderActionSlots(true, actions);
    expect(slots.mobileActions).toBe(actions);
    expect(slots.children).toBeNull();
  });

  it('en desktop: el slot activo es children, mobileActions queda undefined', () => {
    const slots = getResumenDiaHeaderActionSlots(false, actions);
    expect(slots.children).toBe(actions);
    expect(slots.mobileActions).toBeUndefined();
  });

  it('NUNCA hay dos slots con las acciones a la vez (la condición que monta ambos en PanelHeader)', () => {
    for (const isMobileHeader of [true, false]) {
      const slots = getResumenDiaHeaderActionSlots(isMobileHeader, actions);
      // Replica la condición real de PanelHeader.jsx: `children && mobileActions`
      // controla si ambos árboles quedan montados -- debe ser siempre falsy.
      expect(Boolean(slots.children && slots.mobileActions)).toBe(false);
      // Y las acciones deben seguir siendo accesibles en AMBOS breakpoints:
      // exactamente uno de los dos slots las contiene.
      expect([slots.children, slots.mobileActions].filter((s) => s === actions)).toHaveLength(1);
    }
  });
});
