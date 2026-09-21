/**
 * crmService.js — getPeriodSummary (REPORTES-PERIODO-1).
 *
 * Mismo patrón de mocking que crmService.dailySummary.test.js: supabase.from()
 * mockeado con resultados por tabla (fijo o secuenciado por llamada). El foco
 * es el CONTRATO de getPeriodSummary sobre un RANGO -- la equivalencia con
 * getDailySummary para un rango de un solo día vive en un archivo aparte
 * (crmService.periodSummary.equivalence.test.js), que es la prueba más
 * importante del módulo.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: (...args) => fromMock(...args),
  },
}));

import { getPeriodSummary } from './crmService';

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

// Sin sesiones de caja, sin facturas pendientes, sin cost items con
// source_movement_id: mantiene cada tabla en UNA sola llamada por test
// (salvo que el propio test la sobreescriba con un array para simular
// llamadas sucesivas).
const EMPTY_TABLES = {
  crm_invoices: { data: [], error: null },
  crm_payments: { data: [], error: null },
  crm_cost_items: { data: [], error: null },
  crm_cash_movements: { data: [], error: null },
  crm_cash_sessions: { data: [], error: null },
  wa_products: { data: [], error: null },
  crm_stock_movements: { data: [], error: null },
};

describe('getPeriodSummary — rango inválido', () => {
  it('from > to: estado de error explícito, SIN disparar ninguna consulta', async () => {
    const result = await getPeriodSummary('biz1', '2026-09-16', '2026-09-01');
    expect(result.alerts).toEqual([{ type: 'invalid_range', severity: 'error', message: expect.stringContaining('inválido') }]);
    expect(result.sales.available).toBe(false);
    expect(result.metadata.invalid_range).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('fechas faltantes: mismo estado de error', async () => {
    const result = await getPeriodSummary('biz1', null, '2026-09-01');
    expect(result.metadata.invalid_range).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('nunca muestra $0 para un rango inválido -- los totales quedan en null', async () => {
    const result = await getPeriodSummary('biz1', '2026-09-20', '2026-09-01');
    expect(result.sales.net).toBeNull();
    expect(result.collections.total).toBeNull();
    expect(result.expenses.total).toBeNull();
    expect(result.profitability.estimatedResult).toBeNull();
  });
});

describe('getPeriodSummary — rango sin actividad', () => {
  it('devuelve todo en cero, serie diaria completa, sin alertas de negocio', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');

    expect(result.from).toBe('2026-09-01');
    expect(result.to).toBe('2026-09-05');
    expect(result.lengthDays).toBe(5);
    expect(result.sales).toMatchObject({ available: true, gross: 0, net: 0, count: 0, avgTicket: 0, unitsSold: 0, voidedCount: 0 });
    expect(result.sales.dailySeries).toHaveLength(5);
    expect(result.sales.dailySeries.every(d => d.net === 0)).toBe(true);
    expect(result.sales.activityDays).toEqual({ daysWithSales: 0, daysWithoutSales: 5, maxDay: { date: '2026-09-01', net: 0 }, minDay: { date: '2026-09-01', net: 0 } });
    expect(result.collections).toMatchObject({ available: true, total: 0 });
    expect(result.expenses).toMatchObject({ available: true, total: 0 });
    expect(result.cash.sessions).toEqual([]);
    expect(result.inventory).toMatchObject({ lowStockCount: 0 });
    expect(result.profitability.estimatedResult).toBe(0);
    // Sin ventas en NINGÚN día del rango dispara la alerta informativa de
    // "días sin ventas" -- es información real, no un error.
    expect(result.alerts.find(a => a.type === 'days_without_sales')).toBeTruthy();
  });

  it('el rango incluye TODOS los días del período, incluso los que quedarían "vacíos" -- nunca solo los días con actividad', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getPeriodSummary('biz1', '2026-01-01', '2026-01-31');
    expect(result.sales.dailySeries).toHaveLength(31);
    expect(result.sales.dailySeries[0].date).toBe('2026-01-01');
    expect(result.sales.dailySeries[30].date).toBe('2026-01-31');
  });
});

describe('getPeriodSummary — ventas', () => {
  it('excluye ventas anuladas de los totales', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [
          { id: 'i1', status: 'pagada', total: 1000, subtotal: 1000, discount_amount: 0, source: 'crm', order_id: null, created_at: '2026-09-01T10:00:00Z', issue_date: '2026-09-01', crm_invoice_items: [] },
          { id: 'i2', status: 'anulada', total: 5000, subtotal: 5000, discount_amount: 0, source: 'crm', order_id: null, created_at: '2026-09-02T10:00:00Z', issue_date: '2026-09-02', crm_invoice_items: [] },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.net).toBe(1000);
    expect(result.sales.count).toBe(1);
    expect(result.sales.voidedCount).toBe(1);
  });

  it('descuentos: sales.discount refleja la suma de discount_amount de ventas activas', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{ id: 'i1', status: 'pagada', total: 900, subtotal: 1000, discount_amount: 100, source: 'crm', order_id: null, created_at: '2026-09-01T10:00:00Z', issue_date: '2026-09-01', crm_invoice_items: [] }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.gross).toBe(1000);
    expect(result.sales.discount).toBe(100);
    expect(result.sales.net).toBe(900);
  });

  it('canales: TPV (source=pos), online (order_id), CRM/manual (resto) -- sin canales inventados', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [
          { id: 'i1', status: 'pagada', total: 1000, subtotal: 1000, discount_amount: 0, source: 'pos', order_id: null, created_at: '2026-09-01T10:00:00Z', issue_date: '2026-09-01', crm_invoice_items: [] },
          { id: 'i2', status: 'pagada', total: 2000, subtotal: 2000, discount_amount: 0, source: 'crm', order_id: 'ord-1', created_at: '2026-09-02T10:00:00Z', issue_date: '2026-09-02', crm_invoice_items: [] },
          { id: 'i3', status: 'pagada', total: 3000, subtotal: 3000, discount_amount: 0, source: 'crm', order_id: null, created_at: '2026-09-03T10:00:00Z', issue_date: '2026-09-03', crm_invoice_items: [] },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.byChannel).toEqual({ pos: 1000, online: 2000, crmManual: 3000 });
  });

  it('venta online un sábado/domingo aparece normalmente en el período -- no se filtra por calendario operativo del local físico', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        // 2026-09-19 es sábado, 2026-09-20 es domingo.
        data: [
          { id: 'i1', status: 'pagada', total: 1000, subtotal: 1000, discount_amount: 0, source: 'crm', order_id: 'ord-sat', created_at: '2026-09-19T10:00:00Z', issue_date: '2026-09-19', crm_invoice_items: [] },
          { id: 'i2', status: 'pagada', total: 1500, subtotal: 1500, discount_amount: 0, source: 'crm', order_id: 'ord-sun', created_at: '2026-09-20T10:00:00Z', issue_date: '2026-09-20', crm_invoice_items: [] },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-14', '2026-09-20');
    expect(result.sales.byChannel.online).toBe(2500);
    const satRow = result.sales.dailySeries.find(d => d.date === '2026-09-19');
    const sunRow = result.sales.dailySeries.find(d => d.date === '2026-09-20');
    expect(satRow.net).toBe(1000);
    expect(sunRow.net).toBe(1500);
  });

  it('top productos: EXCLUYE líneas sin product_id (manuales) -- decisión de auditoría de REPORTES-PERIODO-1 §7', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{
          id: 'i1', status: 'pagada', total: 5000, subtotal: 5000, discount_amount: 0, source: 'pos', order_id: null,
          created_at: '2026-09-01T10:00:00Z', issue_date: '2026-09-01',
          crm_invoice_items: [
            { product_id: 'p1', name: 'Producto real', quantity: 2, subtotal: 4000 },
            { product_id: null, name: 'Línea manual sin producto', quantity: 1, subtotal: 1000 },
          ],
        }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.topProducts).toHaveLength(1);
    expect(result.sales.topProducts[0].productId).toBe('p1');
    // unitsSold SÍ sigue contando la línea manual -- solo "Top productos" la excluye.
    expect(result.sales.unitsSold).toBe(3);
  });

  it('top 10: limita a 10 productos aunque haya más', async () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ product_id: `p${i}`, name: `Producto ${i}`, quantity: 15 - i, subtotal: (15 - i) * 100 }));
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{ id: 'i1', status: 'pagada', total: 1000, subtotal: 1000, discount_amount: 0, source: 'pos', order_id: null, created_at: '2026-09-01T10:00:00Z', issue_date: '2026-09-01', crm_invoice_items: items }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.topProducts).toHaveLength(10);
  });
});

describe('getPeriodSummary — dinero recibido (medios de pago)', () => {
  it('credit (cuenta corriente) NUNCA aparece en collections -- ya excluido a nivel de consulta', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_payments: {
        data: [{ id: 'p1', amount: 5000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-02', voided_at: null, invoice_id: null }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.collections.byMethod.cash).toBe(5000);
    expect(result.collections.byMethod).not.toHaveProperty('credit');
    expect(Object.keys(result.collections.byMethod)).not.toContain('credit');
  });

  it('todos los medios reales se agregan correctamente por separado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_payments: {
        data: [
          { id: 'p1', amount: 1000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-01', voided_at: null, invoice_id: null },
          { id: 'p2', amount: 2000, payment_method: 'card', payment_status: 'received', payment_date: '2026-09-01', voided_at: null, invoice_id: null },
          { id: 'p3', amount: 3000, payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-02', voided_at: null, invoice_id: null },
          { id: 'p4', amount: 4000, payment_method: 'credit_card', payment_status: 'received', payment_date: '2026-09-02', voided_at: null, invoice_id: null },
          { id: 'p5', amount: 5000, payment_method: 'mercado_pago', payment_status: 'received', payment_date: '2026-09-03', voided_at: null, invoice_id: null },
          { id: 'p6', amount: 6000, payment_method: 'bank_transfer', payment_status: 'received', payment_date: '2026-09-03', voided_at: null, invoice_id: null },
          { id: 'p7', amount: 7000, payment_method: 'check', payment_status: 'received', payment_date: '2026-09-04', voided_at: null, invoice_id: null },
          { id: 'p8', amount: 8000, payment_method: 'other', payment_status: 'received', payment_date: '2026-09-04', voided_at: null, invoice_id: null },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.collections.byMethod).toEqual({ cash: 1000, card: 2000, debit_card: 3000, credit_card: 4000, bank_transfer: 6000, mercado_pago: 5000, check: 7000, other: 8000 });
    expect(result.collections.total).toBe(36000);
  });

  it('pago anulado no cuenta en el total', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_payments: { data: [{ id: 'p1', amount: 9999, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-01', voided_at: '2026-09-01T12:00:00Z', invoice_id: null }], error: null },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.collections.total).toBe(0);
  });

  it('cobro de deuda anterior dentro del período: venta emitida ANTES del rango, cobrada DENTRO del rango', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_payments: {
        data: [{ id: 'p1', amount: 4000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-02', voided_at: null, invoice_id: 'inv-old' }],
        error: null,
      },
      // Lookup batched de la factura fuera del período (issue_date antes del rango).
      crm_invoices: [
        { data: [], error: null }, // primera llamada: ventas del rango (vacío, sin ventas EN el período)
        { data: [{ id: 'inv-old', issue_date: '2026-08-20' }], error: null }, // segunda llamada: lookup de vendidoVsCobrado
      ],
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.collections.vendidoVsCobrado.available).toBe(true);
    expect(result.collections.vendidoVsCobrado.collectedForPriorDebt).toBe(4000);
    expect(result.collections.vendidoVsCobrado.collectedForPeriodSales).toBe(0);
  });

  it('venta del período cobrada DESPUÉS, fuera del período: no aparece en collections de este período (fechas económicas separadas)', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{ id: 'i1', status: 'pendiente', total: 5000, subtotal: 5000, discount_amount: 0, source: 'crm', order_id: null, created_at: '2026-09-01T10:00:00Z', issue_date: '2026-09-01', crm_invoice_items: [] }],
        error: null,
      },
      crm_payments: { data: [], error: null }, // el cobro real ocurre después, fuera de este rango
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.net).toBe(5000);
    expect(result.collections.total).toBe(0);
    expect(result.sales.net).not.toBe(result.collections.total);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// REPORTES-PERIODO-1B — vendidoVsCobrado: pagos parciales cruzando períodos.
//
// Regla financiera bajo prueba (ver bug corregido): "fuera del período" NO
// equivale a "deuda anterior". issue_date < fromDate -> collectedForPriorDebt;
// issue_date > toDate -> collectedForFutureInvoices (dato temporalmente
// inconsistente, NUNCA se cuenta como deuda anterior); sin invoice_id, o con
// invoice_id que no puede resolverse -> collectedUnlinked.
//
// Todas las facturas usadas como status 'pagada' en la consulta principal de
// crm_invoices, deliberadamente, para no disparar la consulta adicional de
// pendingGenerated (`.in('invoice_id', ids)` sobre crm_payments para facturas
// pendientes/parciales) -- esa rama ya tiene su propia cobertura en otros
// tests de este archivo y no es el objetivo de este bloque.
// ═════════════════════════════════════════════════════════════════════════════
describe('getPeriodSummary — vendidoVsCobrado: pagos parciales cruzando períodos (REPORTES-PERIODO-1B)', () => {
  it('Caso A — factura emitida ANTES del período, pagos parciales en agosto/septiembre/octubre: informe de septiembre solo ve los pagos de septiembre, todos como deuda anterior', async () => {
    mockTables({
      ...EMPTY_TABLES,
      // Factura emitida 2026-08-20 ($300.000) -- NO aparece en la consulta
      // principal de ventas de septiembre (issue_date fuera de rango).
      crm_invoices: [
        { data: [], error: null }, // 1ª llamada: ventas del rango (sin ventas en septiembre)
        { data: [{ id: 'inv-a', issue_date: '2026-08-20' }], error: null }, // 2ª llamada: lookup vendidoVsCobrado
      ],
      // Solo los pagos de SEPTIEMBRE (una consulta real por rango ya excluiría
      // los de agosto/octubre) -- $100.000 (25-ago) y $50.000 (5-oct) NUNCA
      // llegan a este mock, tal como no llegarían a la consulta real.
      crm_payments: {
        data: [
          { id: 'pay-ago-no-entra', amount: 100000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-08-25', voided_at: null, invoice_id: 'inv-a' },
          { id: 'pay-sep-10', amount: 80000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-10', voided_at: null, invoice_id: 'inv-a' },
          { id: 'pay-sep-28', amount: 70000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-28', voided_at: null, invoice_id: 'inv-a' },
        ].filter(p => p.payment_date >= '2026-09-01' && p.payment_date <= '2026-09-30'), // simula el filtro real .gte/.lte
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-30');

    expect(result.sales.net).toBe(0); // la factura de agosto no cuenta como venta de septiembre
    expect(result.collections.total).toBe(150000); // 80.000 + 70.000 (el de octubre no entra al filtro de payment_date)
    const vvc = result.collections.vendidoVsCobrado;
    expect(vvc.available).toBe(true);
    expect(vvc.collected).toBe(150000);
    expect(vvc.collectedForPriorDebt).toBe(150000);
    expect(vvc.collectedForPeriodSales).toBe(0);
    expect(vvc.collectedForFutureInvoices).toBe(0);
    expect(vvc.collectedUnlinked).toBe(0);
  });

  it('Caso B — factura emitida DENTRO del período, pagos parciales en septiembre/octubre: septiembre solo ve los pagos de septiembre, como ventas del período', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: {
        data: [{
          id: 'inv-b', status: 'pagada', total: 300000, subtotal: 300000, discount_amount: 0, source: 'crm', order_id: null,
          created_at: '2026-09-05T10:00:00Z', issue_date: '2026-09-05', crm_invoice_items: [],
        }],
        error: null,
      },
      crm_payments: {
        data: [
          { id: 'pay-sep-05', amount: 50000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-05', voided_at: null, invoice_id: 'inv-b' },
          { id: 'pay-sep-15', amount: 100000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-15', voided_at: null, invoice_id: 'inv-b' },
          { id: 'pay-oct-05-no-entra', amount: 150000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-10-05', voided_at: null, invoice_id: 'inv-b' },
        ].filter(p => p.payment_date >= '2026-09-01' && p.payment_date <= '2026-09-30'), // simula el filtro real .gte/.lte
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-30');

    expect(result.sales.net).toBe(300000);
    expect(result.collections.total).toBe(150000); // 50.000 + 100.000; el de octubre no entra
    const vvc = result.collections.vendidoVsCobrado;
    expect(vvc.available).toBe(true);
    expect(vvc.collected).toBe(150000);
    expect(vvc.collectedForPeriodSales).toBe(150000);
    expect(vvc.collectedForPriorDebt).toBe(0);
    expect(vvc.collectedForFutureInvoices).toBe(0);
    expect(vvc.collectedUnlinked).toBe(0);
  });

  it('Caso C — mezcla en el mismo período: venta del período, deuda anterior, pagos parciales, pago sin invoice_id y pago anulado; las categorías suman collections.total', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: [
        {
          // 1ª llamada: ventas del rango -- solo inv-c1 fue EMITIDA en septiembre.
          data: [{
            id: 'inv-c1', status: 'pagada', total: 200000, subtotal: 200000, discount_amount: 0, source: 'crm', order_id: null,
            created_at: '2026-09-10T10:00:00Z', issue_date: '2026-09-10', crm_invoice_items: [],
          }],
          error: null,
        },
        {
          // 2ª llamada: lookup batched de inv-c2 (deuda anterior) e inv-c3 (fecha posterior al período).
          data: [
            { id: 'inv-c2', issue_date: '2026-07-01' },
            { id: 'inv-c3', issue_date: '2026-10-15' },
          ],
          error: null,
        },
      ],
      crm_payments: {
        data: [
          // Dos pagos parciales sobre la MISMA factura del período (inv-c1).
          { id: 'p1', amount: 50000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-11', voided_at: null, invoice_id: 'inv-c1' },
          { id: 'p2', amount: 30000, payment_method: 'card', payment_status: 'received', payment_date: '2026-09-12', voided_at: null, invoice_id: 'inv-c1' },
          // Cobro de deuda anterior (inv-c2, emitida en julio).
          { id: 'p3', amount: 40000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-13', voided_at: null, invoice_id: 'inv-c2' },
          // Cobro asociado a factura con fecha POSTERIOR al período (inv-c3, emitida en octubre) -- dato inconsistente.
          { id: 'p4', amount: 20000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-14', voided_at: null, invoice_id: 'inv-c3' },
          // Pago sin invoice_id -- no se inventa a qué venta corresponde.
          { id: 'p5', amount: 15000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-15', voided_at: null, invoice_id: null },
          // Pago anulado -- NUNCA debe sumar a ninguna categoría ni al total.
          { id: 'p6', amount: 99999, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-16', voided_at: '2026-09-16T12:00:00Z', invoice_id: null },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-30');

    expect(result.collections.total).toBe(155000); // 50k+30k+40k+20k+15k (el anulado NUNCA cuenta)
    const vvc = result.collections.vendidoVsCobrado;
    expect(vvc.available).toBe(true);
    expect(vvc.collected).toBe(155000);
    expect(vvc.collectedForPeriodSales).toBe(80000); // p1 + p2 (inv-c1, emitida en septiembre)
    expect(vvc.collectedForPriorDebt).toBe(40000); // p3 (inv-c2, emitida en julio)
    expect(vvc.collectedForFutureInvoices).toBe(20000); // p4 (inv-c3, emitida en octubre)
    expect(vvc.collectedUnlinked).toBe(15000); // p5 (sin invoice_id)
    // Invariante: la suma de TODAS las categorías clasificadas -- incluyendo
    // los no clasificados -- es exactamente collections.total. Sin redondeos
    // arbitrarios que escondan diferencias.
    expect(vvc.collectedForPeriodSales + vvc.collectedForPriorDebt + vvc.collectedForFutureInvoices + vvc.collectedUnlinked).toBe(vvc.collected);
    expect(vvc.collected).toBe(result.collections.total);
  });

  it('Caso D — pago de septiembre asociado a una factura con issue_date de octubre: NUNCA debe clasificarse como deuda anterior (regresión del bug corregido)', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: [
        { data: [], error: null }, // 1ª llamada: ventas del rango (la factura no fue emitida en septiembre)
        { data: [{ id: 'inv-future', issue_date: '2026-10-05' }], error: null }, // 2ª llamada: lookup
      ],
      crm_payments: {
        data: [{ id: 'pD', amount: 60000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-20', voided_at: null, invoice_id: 'inv-future' }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-30');

    const vvc = result.collections.vendidoVsCobrado;
    expect(vvc.available).toBe(true);
    expect(vvc.collected).toBe(60000);
    // Este es el bug corregido: issue_date (2026-10-05) > toDate (2026-09-30)
    // NUNCA debe caer en collectedForPriorDebt -- "fuera del período" no
    // equivale a "deuda anterior".
    expect(vvc.collectedForPriorDebt).toBe(0);
    expect(vvc.collectedForFutureInvoices).toBe(60000);
    expect(vvc.collectedForPeriodSales).toBe(0);
    expect(vvc.collectedUnlinked).toBe(0);
  });

  it('invariante general: collectedForPeriodSales + collectedForPriorDebt + collectedForFutureInvoices + collectedUnlinked === collected, siempre que vendidoVsCobrado.available sea true', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_invoices: [
        {
          data: [{
            id: 'inv-x1', status: 'pagada', total: 123456, subtotal: 123456, discount_amount: 0, source: 'pos', order_id: null,
            created_at: '2026-09-02T10:00:00Z', issue_date: '2026-09-02', crm_invoice_items: [],
          }],
          error: null,
        },
        {
          data: [
            { id: 'inv-x2', issue_date: '2026-06-15' },
            { id: 'inv-x3', issue_date: '2026-11-01' },
          ],
          error: null,
        },
      ],
      crm_payments: {
        data: [
          { id: 'q1', amount: 111111, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-03', voided_at: null, invoice_id: 'inv-x1' },
          { id: 'q2', amount: 22222, payment_method: 'bank_transfer', payment_status: 'received', payment_date: '2026-09-04', voided_at: null, invoice_id: 'inv-x2' },
          { id: 'q3', amount: 3333, payment_method: 'mercado_pago', payment_status: 'received', payment_date: '2026-09-05', voided_at: null, invoice_id: 'inv-x3' },
          { id: 'q4', amount: 444, payment_method: 'other', payment_status: 'received', payment_date: '2026-09-06', voided_at: null, invoice_id: null },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-30');
    const vvc = result.collections.vendidoVsCobrado;
    expect(vvc.available).toBe(true);
    const categorizedSum = vvc.collectedForPeriodSales + vvc.collectedForPriorDebt + vvc.collectedForFutureInvoices + vvc.collectedUnlinked;
    expect(categorizedSum).toBe(vvc.collected);
    expect(vvc.collected).toBe(result.collections.total);
  });
});

describe('getPeriodSummary — gastos vs egresos de caja', () => {
  it('gasto (crm_cost_item variable) y egreso no-gasto NUNCA se suman dos veces', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cost_items: {
        data: [{ id: 'c1', type: 'variable', amount: 15000, category: 'supplies', source: 'manual', source_movement_id: null, created_at: '2026-09-02T09:00:00Z', month: 9, year: 2026 }],
        error: null,
      },
      crm_cash_movements: {
        data: [{ id: 'm1', direction: 'out', amount: 20000, movement_date: '2026-09-03', is_expense: false, voided_at: null, category: 'owner_withdrawal' }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.expenses.total).toBe(15000);
    expect(result.expenses.byCategory).toEqual({ supplies: 15000 });
    expect(result.expenses.cashOutflowsNonExpense).toBe(20000);
  });

  it('categorías: agrega correctamente por categoría a través de varios días', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cost_items: {
        data: [
          { id: 'c1', type: 'variable', amount: 10000, category: 'supplies', source: 'manual', source_movement_id: null, created_at: '2026-09-01T09:00:00Z', month: 9, year: 2026 },
          { id: 'c2', type: 'variable', amount: 5000, category: 'supplies', source: 'manual', source_movement_id: null, created_at: '2026-09-02T09:00:00Z', month: 9, year: 2026 },
          { id: 'c3', type: 'variable', amount: 8000, category: 'services', source: 'manual', source_movement_id: null, created_at: '2026-09-03T09:00:00Z', month: 9, year: 2026 },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.expenses.byCategory).toEqual({ supplies: 15000, services: 8000 });
    expect(result.expenses.total).toBe(23000);
  });
});

describe('getPeriodSummary — caja y conciliación', () => {
  it('sesión cerrada CON snapshot: usa exclusivamente crm_cash_session_reconciliations, nunca recalcula', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 's1', date: '2026-09-02', status: 'closed', opened_at: '2026-09-02T09:00:00Z', closed_at: '2026-09-02T20:00:00Z', initial_amount: 10000 }],
        error: null,
      },
      crm_cash_session_reconciliations: {
        data: [{ id: 'r1', session_id: 's1', payment_method: 'cash', expected_amount: 50000, reconciled_amount: 49000, difference: -1000 }],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.cash.closedCount).toBe(1);
    expect(result.cash.sessions[0].reconciliation).toEqual([{ id: 'r1', session_id: 's1', payment_method: 'cash', expected_amount: 50000, reconciled_amount: 49000, difference: -1000 }]);
    expect(result.cash.sessionsWithDifference).toBe(1);
    expect(result.cash.totalDifferenceAvailable).toBe(true);
    expect(result.cash.totalDifference).toBe(-1000);
  });

  it('sesión cerrada LEGACY sin snapshot: "sin arqueo" -- nunca fabrica esperado/conciliado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 's1', date: '2026-09-02', status: 'closed', opened_at: '2026-09-02T09:00:00Z', closed_at: '2026-09-02T20:00:00Z', initial_amount: 10000 }],
        error: null,
      },
      crm_cash_session_reconciliations: { data: [], error: null },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.cash.sessions[0].reconciliation).toBeNull();
    expect(result.cash.sessions[0].reconciliationUnavailable).toBe(false);
    expect(result.cash.totalDifferenceAvailable).toBe(false);
    expect(result.cash.totalDifference).toBeNull();
  });

  it('múltiples sesiones cerradas: batchea las conciliaciones en UNA sola consulta (no una por sesión)', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [
          { id: 's1', date: '2026-09-01', status: 'closed', opened_at: '2026-09-01T09:00:00Z', closed_at: '2026-09-01T20:00:00Z', initial_amount: 0 },
          { id: 's2', date: '2026-09-02', status: 'closed', opened_at: '2026-09-02T09:00:00Z', closed_at: '2026-09-02T20:00:00Z', initial_amount: 0 },
        ],
        error: null,
      },
      crm_cash_session_reconciliations: {
        data: [
          { id: 'r1', session_id: 's1', payment_method: 'cash', expected_amount: 1000, reconciled_amount: 1000, difference: 0 },
          { id: 'r2', session_id: 's2', payment_method: 'cash', expected_amount: 2000, reconciled_amount: 2000, difference: 0 },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.cash.closedCount).toBe(2);
    expect(result.cash.sessions.map(s => s.id).sort()).toEqual(['s1', 's2']);
    // UNA sola llamada a crm_cash_session_reconciliations, no dos.
    expect(fromMock.mock.calls.filter(c => c[0] === 'crm_cash_session_reconciliations')).toHaveLength(1);
  });

  it('caja abierta: usa efectivo esperado SOLO efectivo físico -- nunca infla con débito/crédito/MP/etc.', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [{ id: 's1', date: '2026-09-05', status: 'open', opened_at: '2026-09-05T09:00:00Z', closed_at: null, initial_amount: 10000 }],
        error: null,
      },
      // crm_payments se consulta 3 veces en este escenario: (1) rango de
      // "dinero recibido" del período (getCashPaymentsForDateRange), luego
      // getCashSessionPayments hace (2) linkedQuery y (3) legacyQuery para la
      // sesión abierta -- se mockea cada llamada por separado.
      crm_payments: [
        { data: [{ id: 'p1', amount: 5000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-05', voided_at: null, invoice_id: null, cash_session_id: 's1' }], error: null },
        { data: [{ id: 'p1', amount: 5000, payment_method: 'cash', payment_status: 'received', payment_date: '2026-09-05', voided_at: null, invoice_id: null, cash_session_id: 's1' }], error: null },
        { data: [{ id: 'p2', amount: 8000, payment_method: 'debit_card', payment_status: 'received', payment_date: '2026-09-05', voided_at: null, invoice_id: null, cash_session_id: 's1' }], error: null },
      ],
      crm_cash_movements: { data: [], error: null },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    const session = result.cash.sessions[0];
    expect(session.isLiveEstimate).toBe(true);
    // Efectivo esperado: SOLO fondo inicial + cobros CASH (nunca débito).
    expect(session.liveEstimate.expectedCash).toBe(15000);
    expect(session.liveEstimate.receivedByMethod.debit_card).toBe(8000);
    expect(session.liveEstimate.expectedCash).not.toBe(15000 + 8000);
  });

  it('N° de sesiones / abiertas / cerradas se cuentan correctamente', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_cash_sessions: {
        data: [
          { id: 's1', date: '2026-09-01', status: 'closed', opened_at: '2026-09-01T09:00:00Z', closed_at: '2026-09-01T20:00:00Z', initial_amount: 0 },
          { id: 's2', date: '2026-09-05', status: 'open', opened_at: '2026-09-05T09:00:00Z', closed_at: null, initial_amount: 0 },
        ],
        error: null,
      },
      crm_cash_session_reconciliations: { data: [], error: null },
      crm_payments: [{ data: [], error: null }, { data: [], error: null }],
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.cash.sessionsCount).toBe(2);
    expect(result.cash.closedCount).toBe(1);
    expect(result.cash.openCount).toBe(1);
  });
});

describe('getPeriodSummary — inventario', () => {
  it('agrega movimientos por tipo (entrada/salida/ajuste) del rango', async () => {
    mockTables({
      ...EMPTY_TABLES,
      crm_stock_movements: {
        data: [
          { id: 'm1', product_id: 'p1', type: 'entrada', quantity: 10, notes: null, created_at: '2026-09-01T10:00:00Z', wa_products: { name: 'Producto A' } },
          { id: 'm2', product_id: 'p1', type: 'salida', quantity: -3, notes: null, created_at: '2026-09-02T10:00:00Z', wa_products: { name: 'Producto A' } },
          { id: 'm3', product_id: 'p2', type: 'ajuste', quantity: 5, notes: null, created_at: '2026-09-03T10:00:00Z', wa_products: { name: 'Producto B' } },
        ],
        error: null,
      },
    });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.inventory.movementsSummary).toEqual({ entrada: 10, salida: 3, ajuste: 5 });
    expect(result.inventory.topOutflowProducts).toEqual([{ productId: 'p1', name: 'Producto A', quantity: 3 }]);
  });

  it('lowStockCount refleja el stock ACTUAL, etiquetado explícitamente (isLowStockForToday) -- nunca un histórico inventado', async () => {
    mockTables({
      ...EMPTY_TABLES,
      wa_products: { data: [{ id: 'p1', stock_actual: 2, stock_minimo: 5 }], error: null },
    });
    const past = await getPeriodSummary('biz1', '2020-01-01', '2020-01-05');
    expect(past.inventory.lowStockCount).toBe(1);
    expect(past.inventory.isLowStockForToday).toBe(false);
  });
});

describe('getPeriodSummary — indisponibilidad de datos (available != $0)', () => {
  it('si la consulta de ventas falla, sales queda con available=false y valores null (nunca $0)', async () => {
    mockTables({ ...EMPTY_TABLES, crm_invoices: { data: null, error: new Error('boom') } });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.sales.available).toBe(false);
    expect(result.sales.net).toBeNull();
    expect(result.sales.dailySeries).toBeNull(); // nunca dibuja una serie de $0 fabricada
    expect(result.alerts.some(a => a.type === 'data_unavailable' && a.section === 'sales')).toBe(true);
  });

  it('si ventas falla, el saldo (profitability) también queda unavailable -- depende de sales+expenses', async () => {
    mockTables({ ...EMPTY_TABLES, crm_invoices: { data: null, error: new Error('boom') } });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.profitability.available).toBe(false);
    expect(result.profitability.estimatedResult).toBeNull();
  });

  it('si cobros falla, collections queda unavailable', async () => {
    mockTables({ ...EMPTY_TABLES, crm_payments: { data: null, error: new Error('boom') } });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.collections.available).toBe(false);
    expect(result.collections.total).toBeNull();
  });

  it('si gastos falla, expenses queda unavailable', async () => {
    mockTables({ ...EMPTY_TABLES, crm_cost_items: { data: null, error: new Error('boom') } });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.expenses.available).toBe(false);
  });

  it('si caja falla, cash queda unavailable', async () => {
    mockTables({ ...EMPTY_TABLES, crm_cash_sessions: { data: null, error: new Error('boom') } });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.cash.available).toBe(false);
    expect(result.cash.sessions).toEqual([]);
  });

  it('si inventario falla, inventory queda unavailable', async () => {
    mockTables({ ...EMPTY_TABLES, crm_stock_movements: { data: null, error: new Error('boom') } });
    const result = await getPeriodSummary('biz1', '2026-09-01', '2026-09-05');
    expect(result.inventory.available).toBe(false);
  });
});

describe('getPeriodSummary — límites de período', () => {
  it('límite de mes: 28 feb a 1 mar (año no bisiesto) cruza el mes sin perder días', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getPeriodSummary('biz1', '2026-02-28', '2026-03-01');
    expect(result.lengthDays).toBe(2);
    expect(result.sales.dailySeries.map(d => d.date)).toEqual(['2026-02-28', '2026-03-01']);
  });

  it('año nuevo: 31 dic a 1 ene cruza el año sin perder días', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getPeriodSummary('biz1', '2026-12-31', '2027-01-01');
    expect(result.lengthDays).toBe(2);
    expect(result.sales.dailySeries.map(d => d.date)).toEqual(['2026-12-31', '2027-01-01']);
  });

  it('un solo día (hoy=ayer=mismo día) funciona como caso límite de rango', async () => {
    mockTables(EMPTY_TABLES);
    const result = await getPeriodSummary('biz1', '2026-09-16', '2026-09-16');
    expect(result.lengthDays).toBe(1);
    expect(result.metadata.is_single_day).toBe(true);
  });
});
