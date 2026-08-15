import { beforeEach, describe, expect, it, vi } from 'vitest';

const getBillingSubscriptionByProviderSubscriptionIdMock = vi.fn();
vi.mock('../../repositories/billingSubscriptionRepository.js', () => ({
  getBillingSubscriptionByProviderSubscriptionId: (...args) => getBillingSubscriptionByProviderSubscriptionIdMock(...args),
}));

const maybeSingleMock = vi.fn();
const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
const selectMock = vi.fn(() => ({ eq: eqMock }));
const fromMock = vi.fn(() => ({ select: selectMock }));
const rpcMock = vi.fn();
const createClientMock = vi.fn(() => ({ from: fromMock, rpc: rpcMock }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args) => createClientMock(...args),
}));

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

import {
  buildPaypalReferralPeriodRef,
  isEligiblePaypalSaleCompleted,
  isSaleStateCompleted,
  parsePaypalSaleAmount,
  registerPaypalReferralPaidPeriod,
  resolveReferredUserId,
} from './paypalReferralBridge.js';

const SUBSCRIPTION_ID = 'I-RENEWAL-SUB-1';
const BUSINESS_ID = 'biz-1';
const USER_ID = 'user-1';
const CREATE_TIME = '2026-06-15T10:00:00Z';

function saleResource(overrides = {}) {
  return {
    id: '8RX123456789',
    billing_agreement_id: SUBSCRIPTION_ID,
    state: 'completed',
    amount: { total: '10.00', currency: 'USD' },
    create_time: CREATE_TIME,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('buildPaypalReferralPeriodRef', () => {
  it('2. construye "paypal:<sale_id>"', () => {
    expect(buildPaypalReferralPeriodRef('8RX123456789')).toBe('paypal:8RX123456789');
  });

  it('15. dos sale_id distintos generan dos period_ref distintos', () => {
    const ref1 = buildPaypalReferralPeriodRef('8RX111');
    const ref2 = buildPaypalReferralPeriodRef('8RX222');
    expect(ref1).not.toBe(ref2);
    expect(ref1).toBe('paypal:8RX111');
    expect(ref2).toBe('paypal:8RX222');
  });

  it('11. el mismo sale_id siempre construye el mismo period_ref (base de la idempotencia)', () => {
    expect(buildPaypalReferralPeriodRef('8RX999')).toBe(buildPaypalReferralPeriodRef('8RX999'));
  });

  it('sale_id vacío -> null', () => {
    expect(buildPaypalReferralPeriodRef('')).toBeNull();
    expect(buildPaypalReferralPeriodRef(null)).toBeNull();
  });
});

describe('parsePaypalSaleAmount', () => {
  it('lee resource.amount.total como número', () => {
    expect(parsePaypalSaleAmount({ amount: { total: '10.00', currency: 'USD' } })).toBe(10);
  });

  it('amount.total="0.00" -> 0 (no > 0, se filtra en isEligiblePaypalSaleCompleted)', () => {
    expect(parsePaypalSaleAmount({ amount: { total: '0.00' } })).toBe(0);
  });

  it('amount ausente -> null, nunca inventa un monto', () => {
    expect(parsePaypalSaleAmount({})).toBeNull();
    expect(parsePaypalSaleAmount({ amount: {} })).toBeNull();
    expect(parsePaypalSaleAmount(null)).toBeNull();
  });

  it('amount.total no numérico -> null', () => {
    expect(parsePaypalSaleAmount({ amount: { total: 'not-a-number' } })).toBeNull();
  });
});

describe('isSaleStateCompleted', () => {
  it('state="completed" -> true', () => {
    expect(isSaleStateCompleted({ state: 'completed' })).toBe(true);
  });

  it('state ausente -> true (no bloquea por ausencia, no confirmado que siempre venga)', () => {
    expect(isSaleStateCompleted({})).toBe(true);
  });

  it('state="denied"/"pending" -> false', () => {
    expect(isSaleStateCompleted({ state: 'denied' })).toBe(false);
    expect(isSaleStateCompleted({ state: 'pending' })).toBe(false);
  });
});

describe('isEligiblePaypalSaleCompleted', () => {
  const base = {
    eventType: 'PAYMENT.SALE.COMPLETED',
    saleId: '8RX123',
    paypalSubscriptionId: SUBSCRIPTION_ID,
    createTime: CREATE_TIME,
    amount: 10,
    resource: saleResource(),
  };

  it('caso válido -> true', () => {
    expect(isEligiblePaypalSaleCompleted(base)).toBe(true);
  });

  it('4/5. amount debe ser > 0 -- amount=0 -> false', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, amount: 0 })).toBe(false);
  });

  it('amount no numérico -> false', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, amount: null })).toBe(false);
  });

  it('6. subscription id ausente -> false', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, paypalSubscriptionId: '' })).toBe(false);
  });

  it('7. sale id ausente -> false', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, saleId: '' })).toBe(false);
  });

  it('createTime ausente o no parseable -> false, nunca inventa una fecha', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, createTime: null })).toBe(false);
    expect(isEligiblePaypalSaleCompleted({ ...base, createTime: 'not-a-date' })).toBe(false);
  });

  it('12. BILLING.SUBSCRIPTION.ACTIVATED nunca es elegible (no es un pago)', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, eventType: 'BILLING.SUBSCRIPTION.ACTIVATED' })).toBe(false);
  });

  it('13/14. PAYMENT.SALE.REFUNDED / REVERSED nunca son elegibles', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, eventType: 'PAYMENT.SALE.REFUNDED' })).toBe(false);
    expect(isEligiblePaypalSaleCompleted({ ...base, eventType: 'PAYMENT.SALE.REVERSED' })).toBe(false);
  });

  it('resource.state incompatible ("denied") -> false aunque el resto sea válido', () => {
    expect(isEligiblePaypalSaleCompleted({ ...base, resource: saleResource({ state: 'denied' }) })).toBe(false);
  });
});

describe('resolveReferredUserId', () => {
  it('16. JSON local vacío + billing_subscriptions (durable) resuelve business_id -> luego wa_businesses.user_id', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: { user_id: USER_ID }, error: null });

    const result = await resolveReferredUserId(SUBSCRIPTION_ID);

    expect(getBillingSubscriptionByProviderSubscriptionIdMock).toHaveBeenCalledWith('paypal', SUBSCRIPTION_ID);
    expect(fromMock).toHaveBeenCalledWith('wa_businesses');
    expect(selectMock).toHaveBeenCalledWith('user_id');
    expect(eqMock).toHaveBeenCalledWith('id', BUSINESS_ID);
    expect(result).toBe(USER_ID);
  });

  it('8. business no encontrado -> null, nunca inventa', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue(null);

    const result = await resolveReferredUserId(SUBSCRIPTION_ID);

    expect(result).toBeNull();
    expect(fromMock).not.toHaveBeenCalled(); // ni siquiera intenta wa_businesses sin business_id
  });

  it('9. business encontrado pero sin user_id en wa_businesses -> null', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await resolveReferredUserId(SUBSCRIPTION_ID);

    expect(result).toBeNull();
  });

  it('error en el lookup de wa_businesses -> null, controlado, no lanza', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: null, error: { message: 'connection reset' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await resolveReferredUserId(SUBSCRIPTION_ID);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('subscriptionId vacío -> null sin consultar nada', async () => {
    const result = await resolveReferredUserId('');
    expect(result).toBeNull();
    expect(getBillingSubscriptionByProviderSubscriptionIdMock).not.toHaveBeenCalled();
  });
});

describe('registerPaypalReferralPaidPeriod', () => {
  it('1/2/3. evento válido -> llama wa_register_referral_paid_period con period_ref y period_start correctos', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: { user_id: USER_ID }, error: null });
    rpcMock.mockResolvedValue({ data: { registered: true }, error: null });

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });

    expect(rpcMock).toHaveBeenCalledWith('wa_register_referral_paid_period', {
      p_referred_user_id: USER_ID,
      p_period_ref: 'paypal:8RX123456789',
      p_period_start: CREATE_TIME,
    });
    expect(result).toEqual({ registered: true, periodRef: 'paypal:8RX123456789', result: { registered: true } });
  });

  it('5. amount 0 -> no elegible, RPC nunca se llama', async () => {
    const result = await registerPaypalReferralPaidPeriod({
      eventType: 'PAYMENT.SALE.COMPLETED',
      resource: saleResource({ amount: { total: '0.00' } }),
    });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: false, reason: 'not_eligible' });
  });

  it('6. subscription id ausente (sin billing_agreement_id) -> no elegible, RPC nunca se llama', async () => {
    const resource = saleResource();
    delete resource.billing_agreement_id;

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: false, reason: 'not_eligible' });
  });

  it('7. sale id ausente -> no elegible, RPC nunca se llama', async () => {
    const resource = saleResource();
    delete resource.id;

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: false, reason: 'not_eligible' });
  });

  it('8. business no encontrado -> RPC nunca se llama', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue(null);

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: false, reason: 'referred_user_not_resolved' });
  });

  it('9. user_id no encontrado -> RPC nunca se llama', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });

    expect(rpcMock).not.toHaveBeenCalled();
    expect(result).toEqual({ registered: false, reason: 'referred_user_not_resolved' });
  });

  it('10. la RPC falla -> se captura, nunca lanza (billing no se ve afectado por el llamador)', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: { user_id: USER_ID }, error: null });
    rpcMock.mockResolvedValue({ data: null, error: { message: 'db unavailable' } });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });

    expect(result).toEqual({ registered: false, reason: 'rpc_error' });
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('11. mismo sale_id procesado dos veces -> mismo period_ref ambas veces (idempotencia real la garantiza el índice único de referral_paid_periods, ya probado en fases previas)', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: BUSINESS_ID });
    maybeSingleMock.mockResolvedValue({ data: { user_id: USER_ID }, error: null });
    rpcMock.mockResolvedValue({ data: { registered: true }, error: null });

    await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });
    await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });

    expect(rpcMock).toHaveBeenNthCalledWith(1, 'wa_register_referral_paid_period', expect.objectContaining({ p_period_ref: 'paypal:8RX123456789' }));
    expect(rpcMock).toHaveBeenNthCalledWith(2, 'wa_register_referral_paid_period', expect.objectContaining({ p_period_ref: 'paypal:8RX123456789' }));
  });

  it('excepción inesperada durante la resolución -> capturada, nunca se propaga', async () => {
    getBillingSubscriptionByProviderSubscriptionIdMock.mockRejectedValue(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await registerPaypalReferralPaidPeriod({ eventType: 'PAYMENT.SALE.COMPLETED', resource: saleResource() });

    expect(result.registered).toBe(false);
    warnSpy.mockRestore();
  });
});
