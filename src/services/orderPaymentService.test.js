import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpcMock = vi.fn();
const fromMock = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    rpc: (...args) => rpcMock(...args),
    from: (...args) => fromMock(...args),
  },
}));

import {
  getOrderPayment,
  registerManualOrderPayment,
  getManualPaymentErrorMessage,
  mapOrderPaymentFromDb,
} from './orderPaymentService';

function makeQueryBuilder(result) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
  };
  return builder;
}

beforeEach(() => {
  rpcMock.mockReset();
  fromMock.mockReset();
});

const RAW_MP_ROW = {
  id: 'pay-1',
  business_id: 'biz-1',
  order_id: 'order-1',
  provider: 'mercado_pago',
  method: 'checkout_pro',
  provider_payment_id: '123456789',
  status: 'confirmed',
  gross_amount: '10000.00',
  currency: 'CLP',
  walinka_fee: '100.00',
  mp_fee: null,
  net_amount: null,
  payer_name: null,
  payer_email: null,
  paid_at: '2026-09-10T12:00:00Z',
  registered_by: null,
  notes: null,
  created_at: '2026-09-10T12:00:00Z',
  updated_at: '2026-09-10T12:00:00Z',
};

describe('mapOrderPaymentFromDb', () => {
  it('null -> null', () => {
    expect(mapOrderPaymentFromDb(null)).toBeNull();
  });

  it('mapea snake_case a camelCase, convierte NUMERIC a number', () => {
    const mapped = mapOrderPaymentFromDb(RAW_MP_ROW);
    expect(mapped).toEqual({
      id: 'pay-1',
      businessId: 'biz-1',
      orderId: 'order-1',
      provider: 'mercado_pago',
      method: 'checkout_pro',
      providerPaymentId: '123456789',
      status: 'confirmed',
      grossAmount: 10000,
      currency: 'CLP',
      walinkaFee: 100,
      mpFee: null,
      netAmount: null,
      payerName: null,
      payerEmail: null,
      paidAt: '2026-09-10T12:00:00Z',
      registeredBy: null,
      notes: null,
      createdAt: '2026-09-10T12:00:00Z',
      updatedAt: '2026-09-10T12:00:00Z',
    });
  });

  it('mp_fee/net_amount NULL se mapean a null, nunca a 0 ni inventados', () => {
    const mapped = mapOrderPaymentFromDb({ ...RAW_MP_ROW, mp_fee: null, net_amount: null });
    expect(mapped.mpFee).toBeNull();
    expect(mapped.netAmount).toBeNull();
  });

  it('mp_fee/net_amount presentes se convierten a number', () => {
    const mapped = mapOrderPaymentFromDb({ ...RAW_MP_ROW, mp_fee: '50.00', net_amount: '9850.00' });
    expect(mapped.mpFee).toBe(50);
    expect(mapped.netAmount).toBe(9850);
  });

  it('walinka_fee NULL (no debería ocurrir, DB tiene DEFAULT 0) igual mapea a 0, nunca null', () => {
    const mapped = mapOrderPaymentFromDb({ ...RAW_MP_ROW, walinka_fee: null });
    expect(mapped.walinkaFee).toBe(0);
  });
});

describe('getOrderPayment', () => {
  it('consulta wa_order_payments filtrando por order_id, ordenando por created_at desc, limit 1', async () => {
    const builder = makeQueryBuilder({ data: RAW_MP_ROW, error: null });
    fromMock.mockReturnValue(builder);

    const { data, error } = await getOrderPayment('order-1');

    expect(fromMock).toHaveBeenCalledWith('wa_order_payments');
    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('order_id', 'order-1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(1);
    expect(error).toBeNull();
    expect(data).toMatchObject({ id: 'pay-1', provider: 'mercado_pago', method: 'checkout_pro' });
  });

  it('sin fila (pedido pendiente o pagado histórico sin backfill) -> data: null, sin error', async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: null }));
    const { data, error } = await getOrderPayment('order-2');
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it('sin orderId -> no consulta la DB, devuelve null', async () => {
    const { data, error } = await getOrderPayment(null);
    expect(fromMock).not.toHaveBeenCalled();
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it('propaga el error de la consulta', async () => {
    fromMock.mockReturnValue(makeQueryBuilder({ data: null, error: { message: 'boom' } }));
    const { data, error } = await getOrderPayment('order-1');
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'boom' });
  });
});

describe('registerManualOrderPayment', () => {
  it('llama a wa_register_manual_order_payment con los params correctos', async () => {
    rpcMock.mockResolvedValue({ data: 'new-payment-id', error: null });

    const { data, error } = await registerManualOrderPayment({
      orderId: 'order-1',
      method: 'cash',
      amount: 10000,
      currency: 'CLP',
      notes: '  pagó en mostrador  ',
    });

    expect(rpcMock).toHaveBeenCalledWith('wa_register_manual_order_payment', {
      p_order_id: 'order-1',
      p_method: 'cash',
      p_amount: 10000,
      p_currency: 'CLP',
      p_notes: 'pagó en mostrador',
    });
    expect(error).toBeNull();
    expect(data).toBe('new-payment-id');
  });

  it('nota vacía/ausente se envía como null, nunca string vacío', async () => {
    rpcMock.mockResolvedValue({ data: 'id', error: null });
    await registerManualOrderPayment({ orderId: 'order-1', method: 'other', amount: 500, currency: 'ARS', notes: '   ' });
    expect(rpcMock).toHaveBeenCalledWith('wa_register_manual_order_payment', expect.objectContaining({ p_notes: null }));
  });

  it('propaga el error de la RPC (p.ej. ORDER_ALREADY_PAID)', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'ORDER_ALREADY_PAID' } });
    const { data, error } = await registerManualOrderPayment({ orderId: 'order-1', method: 'cash', amount: 10000, currency: 'CLP' });
    expect(data).toBeNull();
    expect(error).toEqual({ message: 'ORDER_ALREADY_PAID' });
  });
});

describe('getManualPaymentErrorMessage', () => {
  it('mapea cada código conocido a un mensaje amigable', () => {
    for (const code of [
      'NOT_AUTHENTICATED', 'MISSING_REQUIRED_PARAMETER', 'INVALID_PAYMENT_METHOD',
      'INVALID_AMOUNT', 'ORDER_NOT_FOUND_OR_NOT_OWNED', 'ORDER_ALREADY_PAID',
      'AMOUNT_MISMATCH', 'CURRENCY_MISMATCH',
    ]) {
      const msg = getManualPaymentErrorMessage(code);
      expect(typeof msg).toBe('string');
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).not.toBe(code); // nunca el código crudo
    }
  });

  it('código desconocido/ausente -> mensaje genérico, nunca undefined ni el texto crudo', () => {
    expect(getManualPaymentErrorMessage('ALGO_INVENTADO')).toBe('No pudimos registrar el pago. Intenta nuevamente.');
    expect(getManualPaymentErrorMessage(undefined)).toBe('No pudimos registrar el pago. Intenta nuevamente.');
  });
});
