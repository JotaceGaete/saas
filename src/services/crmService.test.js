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

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
  },
}));

import { createPosInvoice } from './crmService';

beforeEach(() => {
  rpcMock.mockReset();
});

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
