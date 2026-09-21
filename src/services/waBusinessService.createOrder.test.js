/**
 * waBusinessService.js — createOrder() (SEGURIDAD-WALINKA-1E).
 *
 * createOrder() creaba wa_orders + wa_order_items con 2 INSERT
 * independientes desde el cliente. wa_order_items_anon_insert (WITH
 * CHECK(true)) no validaba en absoluto que el order_id perteneciera a un
 * pedido recién creado por el mismo actor -- cualquier anon/authenticated
 * podía insertar un item arbitrario en el pedido de cualquier negocio.
 *
 * createOrder() ahora llama a la RPC atómica wa_create_order_with_items()
 * (SECURITY DEFINER) en una sola invocación -- este archivo prueba que:
 *   1. el flujo legítimo (checkout público) sigue funcionando igual;
 *   2. createOrder() NUNCA vuelve a hacer INSERT directo en wa_orders ni
 *      en wa_order_items (la vía insegura que dejaba huérfana la policy);
 *   3. el manejo de PLAN_LIMIT_EXCEEDED (mensaje amigable) sigue intacto.
 *
 * Archivo nuevo y acotado a propósito, mismo criterio que
 * waBusinessService.deleteSupplier.test.js: no existe waBusinessService.test.js.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fromMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (...args) => fromMock(...args),
    rpc: (...args) => rpcMock(...args),
  },
}));

import { createOrder } from './waBusinessService';

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockReset();
  // Pre-check de límite mensual del plan: sin negocio encontrado -> se
  // salta el chequeo (mismo comportamiento que hoy si falla la lectura).
  fromMock.mockImplementation((table) => {
    if (table === 'wa_businesses') {
      return { select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) };
    }
    throw new Error(`unexpected supabase.from('${table}') call in createOrder() -- SEGURIDAD-WALINKA-1E: solo wa_businesses (pre-check de plan) es legítimo, wa_orders/wa_order_items deben pasar por la RPC`);
  });
});

const BUSINESS_ID = 'biz-1';
const ORDER_ID = 'order-generated-by-rpc';

describe('createOrder — SEGURIDAD-WALINKA-1E: RPC atómica, nunca INSERT directo', () => {
  it('flujo legítimo: llama a wa_create_order_with_items con business_id, datos del pedido e items', async () => {
    rpcMock.mockResolvedValue({ data: ORDER_ID, error: null });

    const items = [
      { productId: 'p1', productName: 'Producto 1', productPrice: 1000, quantity: 2, subtotal: 2000, selectedOptions: [{ name: 'Talla', value: 'M' }] },
    ];
    const { data, error } = await createOrder(BUSINESS_ID, {
      customerName: 'Cliente Real',
      customerPhone: '56911112222',
      totalAmount: 2000,
      notes: 'Sin cebolla',
    }, items);

    expect(error).toBeNull();
    expect(data).toMatchObject({ id: ORDER_ID, businessId: BUSINESS_ID, totalAmount: 2000 });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [fnName, params] = rpcMock.mock.calls[0];
    expect(fnName).toBe('wa_create_order_with_items');
    expect(params).toMatchObject({
      p_business_id: BUSINESS_ID,
      p_customer_name: 'Cliente Real',
      p_customer_phone: '56911112222',
      p_total_amount: 2000,
      p_notes: 'Sin cebolla',
    });
    expect(params.p_items).toEqual([
      { product_id: 'p1', product_name: 'Producto 1', product_price: 1000, quantity: 2, subtotal: 2000, selected_options: [{ name: 'Talla', value: 'M' }] },
    ]);
  });

  it('pedido sin items: p_items es un array vacío (no null, no undefined)', async () => {
    rpcMock.mockResolvedValue({ data: ORDER_ID, error: null });
    await createOrder(BUSINESS_ID, { customerName: 'Cliente', totalAmount: 0 }, []);
    expect(rpcMock.mock.calls[0][1].p_items).toEqual([]);
  });

  it('NUNCA llama a supabase.from(\'wa_orders\').insert(...) ni supabase.from(\'wa_order_items\').insert(...) -- esa era la vía insegura', async () => {
    rpcMock.mockResolvedValue({ data: ORDER_ID, error: null });
    await createOrder(BUSINESS_ID, { customerName: 'Cliente', totalAmount: 1000 }, [
      { productId: 'p1', productName: 'X', productPrice: 1000, quantity: 1, subtotal: 1000 },
    ]);
    // El mock de `from` lanza si se llama con algo distinto de 'wa_businesses'
    // (ver beforeEach) -- si esta prueba llega hasta acá sin throw, ninguna
    // de las 2 tablas fue tocada directamente.
    for (const call of fromMock.mock.calls) {
      expect(call[0]).toBe('wa_businesses');
    }
  });

  it('PLAN_LIMIT_EXCEEDED devuelto por la RPC (trigger wa_orders_enforce_limit) se traduce al mensaje amigable', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'PLAN_LIMIT_EXCEEDED:Tu plan permite 50 pedidos por mes.' } });
    const { data, error } = await createOrder(BUSINESS_ID, { customerName: 'Cliente', totalAmount: 1000 }, []);
    expect(data).toBeNull();
    expect(error.code).toBe('PLAN_LIMIT_EXCEEDED');
    expect(error.message).toMatch(/límite de pedidos del mes/);
  });

  it('otro error de la RPC (no PLAN_LIMIT_EXCEEDED) se propaga tal cual', async () => {
    const original = { message: 'some other db error', code: '500' };
    rpcMock.mockResolvedValue({ data: null, error: original });
    const { data, error } = await createOrder(BUSINESS_ID, { customerName: 'Cliente', totalAmount: 1000 }, []);
    expect(data).toBeNull();
    expect(error).toBe(original);
  });
});
