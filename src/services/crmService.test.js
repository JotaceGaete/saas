/**
 * crmService.js — createPosInvoice (TPV-CORE-1).
 *
 * Desde esta fase, createPosInvoice es un wrapper delgado de
 * supabase.rpc('crm_create_pos_sale', ...) -- toda la lógica de negocio
 * (idempotencia, validación de stock/pagos/caja, atomicidad) vive
 * server-side (ver 20260910220000_crm_pos_atomic_sale.sql, con su propio
 * test source-scan). Estos tests SÍ son ejecutables de verdad (mockean
 * supabase.rpc) -- cubren el contrato del wrapper: forma del payload
 * enviado a la RPC, mapeo de errores, y unwrap de SETOF.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();
const refreshSessionMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
    auth: {
      refreshSession: (...args) => refreshSessionMock(...args),
    },
  },
}));

import {
  createPosInvoice, getOperatingCostItemsForPeriod, getOperatingSalesForPeriod,
  getCashDayPayments, getCashSessionPayments,
} from './crmService';

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
  refreshSessionMock.mockReset().mockResolvedValue({ data: { session: {} }, error: null });
});

function queryResult(result, calls = []) {
  const proxy = new Proxy(() => {}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
      return (...args) => { calls.push([prop, ...args]); return proxy; };
    },
  });
  return proxy;
}

const baseInput = {
  customerId: null,
  items: [{ product_id: 'p1', name: 'Producto A', unit_price: 1000, quantity: 2 }],
  discount: 0,
  notes: null,
  currency: 'CLP',
  payments: [{ method: 'cash', amount: 2000 }],
  idempotencyKey: 'sale-attempt-1',
};

describe('createPosInvoice — contrato del wrapper', () => {
  it('requiere idempotencyKey -- nunca llama a la RPC sin ella', async () => {
    const { idempotencyKey, ...withoutKey } = baseInput;
    const result = await createPosInvoice('biz1', withoutKey);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('requiere al menos un ítem -- nunca llama a la RPC con carrito vacío', async () => {
    const result = await createPosInvoice('biz1', { ...baseInput, items: [] });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.data).toBeNull();
    expect(result.error).toBeTruthy();
  });

  it('llama a crm_create_pos_sale con los parámetros p_* correctos', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'inv1', status: 'pagada' }], error: null });
    await createPosInvoice('biz1', baseInput);

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, params] = rpcMock.mock.calls[0];
    expect(fnName).toBe('crm_create_pos_sale');
    expect(params.p_business_id).toBe('biz1');
    expect(params.p_idempotency_key).toBe('sale-attempt-1');
    expect(params.p_customer_id).toBeNull();
    expect(params.p_discount).toBe(0);
    expect(params.p_currency).toBe('CLP');
    expect(typeof params.p_issue_date).toBe('string');
    expect(params.p_issue_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('mapea items al shape {product_id, name, unit_price, quantity, note} -- nunca envía discount_pct/subtotal calculados en el cliente', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'inv1' }], error: null });
    await createPosInvoice('biz1', {
      ...baseInput,
      items: [{ product_id: null, name: 'Servicio manual', unit_price: 500, quantity: 1, note: 'a pedido' }],
    });
    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_items).toEqual([
      { product_id: null, name: 'Servicio manual', unit_price: 500, quantity: 1, note: 'a pedido' },
    ]);
  });

  it('normaliza y filtra payments -- descarta montos <= 0, normaliza sinónimos de método', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'inv1' }], error: null });
    await createPosInvoice('biz1', {
      ...baseInput,
      payments: [
        { payment_method: 'efectivo', amount: 1000 },
        { method: 'transferencia', amount: 0 },
        { method: 'tarjeta', amount: 500 },
      ],
    });
    const [, params] = rpcMock.mock.calls[0];
    expect(params.p_payments).toEqual([
      { method: 'cash', amount: 1000 },
      { method: 'card', amount: 500 },
    ]);
  });

  it('respuesta exitosa: unwrap del SETOF (array) a un solo objeto', async () => {
    rpcMock.mockResolvedValue({ data: [{ id: 'inv1', status: 'pagada' }], error: null });
    const result = await createPosInvoice('biz1', baseInput);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ id: 'inv1', status: 'pagada' });
  });
});

describe('getOperatingSalesForPeriod — ventas CRM/TPV + catálogo', () => {
  it('cuenta factura CRM normal, exige order_id NULL y suma catálogo pagado una sola vez', async () => {
    const crmCalls = [];
    const orderCalls = [];
    fromMock.mockImplementation(table => {
      if (table === 'crm_invoices') return queryResult({ data: [{ total: 100, issue_date: '2026-09-05' }], error: null }, crmCalls);
      if (table === 'wa_orders') return queryResult({ data: [{ total_amount: 80, currency: 'CLP', paid_at: '2026-09-05T15:00:00Z', updated_at: '2026-09-05T15:00:00Z' }], error: null }, orderCalls);
      throw new Error(`tabla inesperada: ${table}`);
    });

    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(result).toMatchObject({ crmTotal: 100, catalogTotal: 80, salesMonth: 180 });
    expect(result.dailySales[5]).toBe(180);
    expect(crmCalls).toContainEqual(['is', 'order_id', null]);
    expect(orderCalls).toContainEqual(['eq', 'payment_status', 'pagado']);
  });

  it('fallback legacy usa updated_at explícitamente', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_invoices'
      ? { data: [], error: null }
      : { data: [{ total_amount: 50, currency: 'CLP', paid_at: null, updated_at: '2026-09-07T12:00:00Z' }], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(result.catalogTotal).toBe(50);
    expect(result.legacyCatalogRows).toBe(1);
    expect(result.dailySales[7]).toBe(50);
  });

  it('no mezcla moneda incompatible y conserva el error por fuente', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_invoices'
      ? { data: null, error: { message: 'crm down' } }
      : { data: [{ total_amount: 999, currency: 'USD', paid_at: '2026-09-08T12:00:00Z' }], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(result.salesMonth).toBe(0);
    expect(result.incompatibleCurrencyRows).toBe(1);
    expect(result.errors.crm).toEqual({ message: 'crm down' });
  });

  it('conserva las ventas válidas y reporta por separado las operaciones de moneda incompatible', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_invoices'
      ? { data: [{ total: 100, issue_date: '2026-09-08' }], error: null }
      : { data: [
        { total_amount: 80, currency: 'CLP', paid_at: '2026-09-08T12:00:00Z' },
        { total_amount: 999, currency: 'USD', paid_at: '2026-09-08T13:00:00Z' },
      ], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(result).toMatchObject({ crmTotal: 100, catalogTotal: 80, salesMonth: 180, incompatibleCurrencyRows: 1 });
    expect(result.dailySales[8]).toBe(180);
  });

  it('A) wa_order pagada sin crm_invoice se cuenta exactamente una vez', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_invoices'
      ? { data: [], error: null }
      : { data: [{ total_amount: 80, currency: 'CLP', paid_at: '2026-09-05T15:00:00Z' }], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(result).toMatchObject({ crmTotal: 0, catalogTotal: 80, salesMonth: 80 });
  });

  it('B) wa_order pagada con crm_invoice vinculada se cuenta una vez mediante el filtro order_id IS NULL', async () => {
    const crmCalls = [];
    fromMock.mockImplementation(table => table === 'crm_invoices'
      ? queryResult({ data: [], error: null }, crmCalls)
      : queryResult({ data: [{ total_amount: 80, currency: 'CLP', paid_at: '2026-09-05T15:00:00Z' }], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(crmCalls).toContainEqual(['is', 'order_id', null]);
    expect(result.salesMonth).toBe(80);
  });

  it('C) crm_invoice normal con order_id NULL se cuenta exactamente una vez', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_invoices'
      ? { data: [{ total: 100, issue_date: '2026-09-05' }], error: null }
      : { data: [], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(result).toMatchObject({ crmTotal: 100, catalogTotal: 0, salesMonth: 100 });
  });

  it('D) crm_invoice anulada se excluye mediante status <> anulada', async () => {
    const crmCalls = [];
    fromMock.mockImplementation(table => table === 'crm_invoices'
      ? queryResult({ data: [], error: null }, crmCalls)
      : queryResult({ data: [], error: null }));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(crmCalls).toContainEqual(['neq', 'status', 'anulada']);
    expect(result.salesMonth).toBe(0);
  });

  it('E) wa_order no pagada se excluye mediante payment_status = pagado', async () => {
    const orderCalls = [];
    fromMock.mockImplementation(table => table === 'crm_invoices'
      ? queryResult({ data: [], error: null })
      : queryResult({ data: [], error: null }, orderCalls));
    const result = await getOperatingSalesForPeriod('biz1', 9, 2026, 'CLP');
    expect(orderCalls).toContainEqual(['eq', 'payment_status', 'pagado']);
    expect(result.salesMonth).toBe(0);
  });
});

describe('getOperatingCostItemsForPeriod', () => {
  it('solo consulta Caja para movimientos enlazados y conserva fixed/variable', async () => {
    const movementCalls = [];
    fromMock.mockImplementation(table => {
      if (table === 'crm_cost_items') return queryResult({ data: [
        { id: 'f', type: 'fixed', amount: '300', source: 'manual', source_movement_id: null, created_at: '2026-09-01T00:00:00Z' },
        { id: 'v', type: 'variable', amount: '40', source: 'cash_outflow', source_movement_id: 'm1', created_at: '2026-09-03T00:00:00Z' },
      ], error: null });
      if (table === 'crm_cash_movements') return queryResult({ data: [{ id: 'm1', movement_date: '2026-09-04' }], error: null }, movementCalls);
      throw new Error(`tabla inesperada: ${table}`);
    });
    const { data, error } = await getOperatingCostItemsForPeriod('biz1', 9, 2026);
    expect(error).toBeNull();
    expect(data).toEqual([
      expect.objectContaining({ id: 'f', type: 'fixed', amount: 300 }),
      expect.objectContaining({ id: 'v', type: 'variable', amount: 40, economicDate: '2026-09-04' }),
    ]);
    expect(movementCalls).toContainEqual(['select', 'id, movement_date']);
  });

  it('Caja no decide si el costo canónico se incluye', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_cost_items'
      ? { data: [{ id: 'v', type: 'variable', amount: 40, source: 'cash_outflow', source_movement_id: 'm1' }], error: null }
      : { data: [{ id: 'm1', movement_date: '2026-09-04', is_expense: true, voided_at: '2026-09-05T00:00:00Z' }], error: null }));
    const { data } = await getOperatingCostItemsForPeriod('biz1', 9, 2026);
    expect(data[0]).toMatchObject({ id: 'v', amount: 40, economicDate: '2026-09-04' });
    expect(data[0].excluded).toBeUndefined();
  });

  it('un cash_outflow vinculado conserva una sola fila y toma el monto únicamente de crm_cost_items', async () => {
    fromMock.mockImplementation(table => queryResult(table === 'crm_cost_items'
      ? { data: [{ id: 'v', type: 'variable', amount: 40, source: 'cash_outflow', source_movement_id: 'm1' }], error: null }
      : { data: [{ id: 'm1', amount: 999, movement_date: '2026-09-04', is_expense: true, voided_at: null }], error: null }));
    const { data } = await getOperatingCostItemsForPeriod('biz1', 9, 2026);
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ id: 'v', amount: 40, economicDate: '2026-09-04' });
    expect(data[0].excluded).toBeUndefined();
  });

  it('un movimiento de Caja sin crm_cost_item no se consulta ni genera gasto', async () => {
    fromMock.mockImplementation(table => {
      expect(table).toBe('crm_cost_items');
      return queryResult({ data: [], error: null });
    });
    const { data } = await getOperatingCostItemsForPeriod('biz1', 9, 2026);
    expect(data).toEqual([]);
    expect(fromMock).toHaveBeenCalledTimes(1);
  });
});

describe('createPosInvoice — mapeo de errores (nunca SQL crudo al usuario)', () => {
  it('NO_OPEN_CASH y CREDIT_NO_CUSTOMER se preservan tal cual -- CrmTerminal ya tiene UI especial para esos códigos', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'NO_OPEN_CASH' } });
    let result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).toBe('NO_OPEN_CASH');

    rpcMock.mockResolvedValue({ data: null, error: { message: 'CREDIT_NO_CUSTOMER' } });
    result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).toBe('CREDIT_NO_CUSTOMER');
  });

  it('STOCK_INSUFFICIENT (formato plano, legacy) se traduce a un mensaje legible sin datos estructurados', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'STOCK_INSUFFICIENT' } });
    const result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).not.toBe('STOCK_INSUFFICIENT');
    expect(result.error.message).toMatch(/stock/i);
    expect(result.error.stockInsufficient).toBeUndefined();
  });

  it('STOCK_INSUFFICIENT:<product_id>:<requested>:<available> (TPV-STOCK-UX-1) se parsea a datos estructurados', async () => {
    const productId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    rpcMock.mockResolvedValue({ data: null, error: { message: `STOCK_INSUFFICIENT:${productId}:2:1` } });
    const result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).toMatch(/stock/i);
    expect(result.error.code).toBe('STOCK_INSUFFICIENT');
    expect(result.error.stockInsufficient).toEqual({ productId, requested: 2, available: 1 });
  });

  it('STOCK_INSUFFICIENT estructurado con un product_id malformado no lanza -- cae al mensaje genérico sin datos estructurados', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'STOCK_INSUFFICIENT:not-a-uuid:2:1' } });
    const result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).toMatch(/stock/i);
    expect(result.error.stockInsufficient).toBeUndefined();
  });

  it('PRODUCT_NOT_FOUND se traduce a un mensaje legible', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'PRODUCT_NOT_FOUND' } });
    const result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).not.toBe('PRODUCT_NOT_FOUND');
  });

  it('un error SQL crudo desconocido (constraint/FK de Postgres) nunca se muestra tal cual -- cae al mensaje genérico', async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { message: 'duplicate key value violates unique constraint "crm_invoices_number_unique"' },
    });
    const result = await createPosInvoice('biz1', baseInput);
    expect(result.error.message).not.toMatch(/duplicate key|constraint/i);
  });

  it('nunca lanza -- siempre retorna {data: null, error}', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'INVALID_ITEMS' } });
    await expect(createPosInvoice('biz1', baseInput)).resolves.toEqual(
      expect.objectContaining({ data: null }),
    );
  });
});

/**
 * TPV-BUG — mitigación de "GET .../crm_payments -> 401 Unauthorized".
 * Un 401 es un problema de sesión/JWT, no de RLS (una policy de SELECT
 * que deniega filas nunca produce 401) -- por eso la mitigación es acá,
 * en el cliente (refrescar la sesión y reintentar UNA vez), no en una
 * migración. Estos tests verifican el mecanismo de retry en sí, no que
 * el 401 real de producción esté "resuelto" (eso no se puede probar sin
 * una sesión Supabase real).
 */
describe('TPV-BUG — reintento tras 401 en consultas a crm_payments', () => {
  it('getCashDayPayments: un error con status 401 dispara refreshSession y reintenta UNA vez', async () => {
    fromMock
      .mockReturnValueOnce(queryResult({ data: null, error: { status: 401, message: 'JWT expired' } }))
      .mockReturnValueOnce(queryResult({ data: [{ id: 'p1', payment_method: 'cash' }], error: null }));

    const result = await getCashDayPayments('biz1', '2026-09-12');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });

  it('getCashDayPayments: un error PGRST301 (JWT expired, código de PostgREST) también dispara el retry', async () => {
    fromMock
      .mockReturnValueOnce(queryResult({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }))
      .mockReturnValueOnce(queryResult({ data: [], error: null }));

    await getCashDayPayments('biz1');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
  });

  it('getCashDayPayments: un error que NO es de sesión (ej. RLS/permiso) nunca dispara refreshSession ni reintenta', async () => {
    fromMock.mockReturnValueOnce(queryResult({
      data: null,
      error: { code: '42501', message: 'permission denied for table crm_payments' },
    }));

    const result = await getCashDayPayments('biz1');

    expect(refreshSessionMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledTimes(1);
    expect(result.error).toEqual({ code: '42501', message: 'permission denied for table crm_payments' });
  });

  it('getCashDayPayments: si el reintento TAMBIÉN falla, el error se propaga (nunca reintenta una segunda vez)', async () => {
    fromMock
      .mockReturnValueOnce(queryResult({ data: null, error: { status: 401, message: 'JWT expired' } }))
      .mockReturnValueOnce(queryResult({ data: null, error: { status: 401, message: 'JWT expired' } }));

    const result = await getCashDayPayments('biz1');

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledTimes(2);
    expect(result.error).toEqual({ status: 401, message: 'JWT expired' });
  });

  it('getCashSessionPayments: un 401 en cualquiera de las dos consultas paralelas (linked/legacy) también reintenta', async () => {
    const session = { id: 'sess1', opened_at: '2026-09-12T10:00:00.000Z', closed_at: null };
    fromMock
      .mockReturnValueOnce(queryResult({ data: null, error: { status: 401, message: 'JWT expired' } })) // linked, 1er intento
      .mockReturnValueOnce(queryResult({ data: [], error: null })) // legacy, 1er intento (no falla)
      .mockReturnValueOnce(queryResult({ data: [{ id: 'p1', payment_method: 'cash', created_at: '2026-09-12T11:00:00.000Z' }], error: null })); // linked, retry

    const result = await getCashSessionPayments('biz1', session);

    expect(refreshSessionMock).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(1);
  });
});
