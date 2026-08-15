import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSubscriptionRecordByPaypalIdMock = vi.fn();
const saveOrUpdateSubscriptionRecordMock = vi.fn();
vi.mock('../../repositories/paypalSubscriptionRepository.js', () => ({
  getSubscriptionRecordByPaypalId: (...args) => getSubscriptionRecordByPaypalIdMock(...args),
  saveOrUpdateSubscriptionRecord: (...args) => saveOrUpdateSubscriptionRecordMock(...args),
}));

const getBillingSubscriptionByBusinessIdMock = vi.fn();
const getBillingSubscriptionByProviderSubscriptionIdMock = vi.fn();
const upsertBillingSubscriptionByBusinessMock = vi.fn();
vi.mock('../../repositories/billingSubscriptionRepository.js', () => ({
  getBillingSubscriptionByBusinessId: (...args) => getBillingSubscriptionByBusinessIdMock(...args),
  getBillingSubscriptionByProviderSubscriptionId: (...args) => getBillingSubscriptionByProviderSubscriptionIdMock(...args),
  upsertBillingSubscriptionByBusiness: (...args) => upsertBillingSubscriptionByBusinessMock(...args),
}));

vi.mock('../../config/paypal/index.js', () => ({
  getPaypalMode: () => 'sandbox',
}));

vi.mock('../billing/planMappingService.js', () => ({
  getInternalPlanFromPaypalPlanId: vi.fn(async () => null),
  normalizePlanSlugForBilling: (slug) => (slug ? String(slug).toLowerCase() : null),
}));

vi.mock('../billing/billingStatusMapper.js', () => ({
  mapProviderStatus: vi.fn(() => 'active'),
}));

vi.mock('../billing/subscriptionReceiptService.js', () => ({
  maybeSendSubscriptionReceiptForSubscription: vi.fn(async () => {}),
}));

import { applyEventSnapshot } from './syncService.js';

const PAYPAL_SUBSCRIPTION_ID = 'I-RENEWAL-SUB-1';
const DURABLE_BUSINESS_ID = 'biz-from-billing-subscriptions';
const OTHER_BUSINESS_ID = 'biz-completely-unrelated';

function baseEvent(overrides = {}) {
  return {
    eventType: 'PAYMENT.SALE.COMPLETED',
    paypalSubscriptionId: PAYPAL_SUBSCRIPTION_ID,
    paypalStatus: null,
    paypalPlanId: null,
    customId: null, // PAYMENT.SALE.* nunca trae custom_id -- caso real de paypalEventHandlers.js
    subscriberEmail: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  saveOrUpdateSubscriptionRecordMock.mockImplementation(async (_env, record) => record);
  upsertBillingSubscriptionByBusinessMock.mockResolvedValue({ id: 'sub-row-1' });
  getBillingSubscriptionByBusinessIdMock.mockResolvedValue(null);
});

describe('applyEventSnapshot — resolución de businessId (durable > JSON local)', () => {
  it('A. JSON local contiene el mapping (billing_subscriptions no lo tiene) -> comportamiento existente sigue funcionando', async () => {
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue({ businessId: 'biz-from-local-json', status: 'ACTIVE' });
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue(null); // no está en billing_subscriptions

    const saved = await applyEventSnapshot(baseEvent());

    expect(saved.businessId).toBe('biz-from-local-json');
    expect(upsertBillingSubscriptionByBusinessMock).toHaveBeenCalledWith(
      expect.objectContaining({ business_id: 'biz-from-local-json' }),
    );
  });

  it('B. JSON local vacío + billing_subscriptions tiene provider=paypal y provider_subscription_id correcto -> businessId se recupera', async () => {
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue(null); // JSON local vacío/perdido
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: DURABLE_BUSINESS_ID });

    const saved = await applyEventSnapshot(baseEvent());

    expect(getBillingSubscriptionByProviderSubscriptionIdMock).toHaveBeenCalledWith('paypal', PAYPAL_SUBSCRIPTION_ID);
    expect(saved.businessId).toBe(DURABLE_BUSINESS_ID);
  });

  it('C. subscription id inexistente en ambas fuentes -> no inventa businessId (null)', async () => {
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue(null);
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue(null);

    const saved = await applyEventSnapshot(baseEvent({ paypalSubscriptionId: 'I-DOES-NOT-EXIST-ANYWHERE' }));

    expect(saved.businessId).toBeNull();
    expect(upsertBillingSubscriptionByBusinessMock).not.toHaveBeenCalled();
  });

  it('D. el lookup durable siempre se hace con provider="paypal" exacto -- nunca cruza con otro proveedor', async () => {
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue(null);
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue(null);

    await applyEventSnapshot(baseEvent());

    expect(getBillingSubscriptionByProviderSubscriptionIdMock).toHaveBeenCalledWith('paypal', PAYPAL_SUBSCRIPTION_ID);
    expect(getBillingSubscriptionByProviderSubscriptionIdMock).not.toHaveBeenCalledWith('dlocal', expect.anything());
  });

  it('E. PAYMENT.SALE.COMPLETED semanas después (cold start / JSON local vacío) -> billing sigue encontrando el negocio', async () => {
    // Simula exactamente el bug de la auditoría: la invocación que registró
    // BILLING.SUBSCRIPTION.ACTIVATED hace semanas ya no comparte /tmp con
    // esta invocación -- getSubscriptionRecordByPaypalId devuelve null.
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue(null);
    getBillingSubscriptionByProviderSubscriptionIdMock.mockResolvedValue({ business_id: DURABLE_BUSINESS_ID });

    await applyEventSnapshot(baseEvent({ eventType: 'PAYMENT.SALE.COMPLETED' }));

    expect(upsertBillingSubscriptionByBusinessMock).toHaveBeenCalledWith(
      expect.objectContaining({ business_id: DURABLE_BUSINESS_ID, provider: 'paypal' }),
    );
  });

  it('F. el fallback durable resuelve exclusivamente el negocio de ESTA suscripción, nunca otro', async () => {
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue(null);
    getBillingSubscriptionByProviderSubscriptionIdMock.mockImplementation(async (_provider, subscriptionId) => {
      // Simula la tabla real: cada provider_subscription_id resuelve a UN
      // business_id propio, nunca a otro.
      if (subscriptionId === PAYPAL_SUBSCRIPTION_ID) return { business_id: DURABLE_BUSINESS_ID };
      return { business_id: OTHER_BUSINESS_ID };
    });

    const saved = await applyEventSnapshot(baseEvent({ paypalSubscriptionId: PAYPAL_SUBSCRIPTION_ID }));

    expect(saved.businessId).toBe(DURABLE_BUSINESS_ID);
    expect(saved.businessId).not.toBe(OTHER_BUSINESS_ID);
  });

  it('G. error de Supabase en el lookup durable -> no rompe, no asocia negocio incorrecto, degrada limpiamente', async () => {
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue({ businessId: null }); // JSON local sin businessId tampoco
    getBillingSubscriptionByProviderSubscriptionIdMock.mockRejectedValue(new Error('[billing-subscriptions] read by provider_subscription_id failed: network error'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const saved = await applyEventSnapshot(baseEvent());

    expect(saved.businessId).toBeNull(); // nunca inventa ni asocia un valor incorrecto
    expect(warnSpy).toHaveBeenCalled();
    expect(upsertBillingSubscriptionByBusinessMock).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('prioridad 1: custom_id del propio evento gana siempre, sin ni siquiera consultar billing_subscriptions', async () => {
    // BILLING.SUBSCRIPTION.* sí trae custom_id real (a diferencia de PAYMENT.SALE.*).
    getSubscriptionRecordByPaypalIdMock.mockResolvedValue(null);

    const saved = await applyEventSnapshot(
      baseEvent({ eventType: 'BILLING.SUBSCRIPTION.ACTIVATED', customId: 'business:biz-from-event' }),
    );

    expect(saved.businessId).toBe('biz-from-event');
    expect(getBillingSubscriptionByProviderSubscriptionIdMock).not.toHaveBeenCalled();
  });
});
