import { beforeEach, describe, expect, it, vi } from 'vitest';

const applyRemoteSnapshotMock = vi.fn();
const applyEventSnapshotMock = vi.fn();
vi.mock('./syncService.js', () => ({
  applyRemoteSnapshot: (...args) => applyRemoteSnapshotMock(...args),
  applyEventSnapshot: (...args) => applyEventSnapshotMock(...args),
}));

const registerPaypalReferralPaidPeriodMock = vi.fn();
vi.mock('./paypalReferralBridge.js', () => ({
  registerPaypalReferralPaidPeriod: (...args) => registerPaypalReferralPaidPeriodMock(...args),
}));

import { handlePaypalEvent } from './paypalEventHandlers.js';

const SUBSCRIPTION_ID = 'I-RENEWAL-SUB-1';
const SALE_ID = '8RX123456789';

function saleCompletedEvent(overrides = {}) {
  return {
    event_type: 'PAYMENT.SALE.COMPLETED',
    resource: {
      id: SALE_ID,
      billing_agreement_id: SUBSCRIPTION_ID,
      state: 'completed',
      amount: { total: '10.00', currency: 'USD' },
      create_time: '2026-06-15T10:00:00Z',
      ...overrides,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  applyEventSnapshotMock.mockResolvedValue({ paypalSubscriptionId: SUBSCRIPTION_ID });
  applyRemoteSnapshotMock.mockResolvedValue({ paypalSubscriptionId: SUBSCRIPTION_ID });
  registerPaypalReferralPaidPeriodMock.mockResolvedValue({ registered: true, periodRef: `paypal:${SALE_ID}` });
});

describe('handlePaypalEvent — bug de extracción de subscription id (PAYMENT.SALE.*)', () => {
  it('usa billing_agreement_id como subscriptionId, NUNCA resource.id (el sale id) -- regresión del bug encontrado en esta fase', async () => {
    await handlePaypalEvent(saleCompletedEvent());

    expect(applyEventSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ paypalSubscriptionId: SUBSCRIPTION_ID }),
    );
    // El id de venta (resource.id) NUNCA debe terminar en el campo subscriptionId.
    expect(applyEventSnapshotMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ paypalSubscriptionId: SALE_ID }),
    );
  });

  it('sin billing_agreement_id ni supplementary_data.related_ids.subscription_id -> missing_subscription_id (nunca cae al sale id)', async () => {
    const event = saleCompletedEvent();
    delete event.resource.billing_agreement_id;

    const result = await handlePaypalEvent(event);

    expect(result).toEqual({ handled: false, reason: 'missing_subscription_id', eventType: 'PAYMENT.SALE.COMPLETED' });
    expect(applyEventSnapshotMock).not.toHaveBeenCalled();
  });
});

describe('handlePaypalEvent — Affiliate Core solo para PAYMENT.SALE.COMPLETED', () => {
  it('1. PAYMENT.SALE.COMPLETED -> llama registerPaypalReferralPaidPeriod', async () => {
    await handlePaypalEvent(saleCompletedEvent());

    expect(registerPaypalReferralPaidPeriodMock).toHaveBeenCalledWith({
      eventType: 'PAYMENT.SALE.COMPLETED',
      resource: expect.objectContaining({ id: SALE_ID, billing_agreement_id: SUBSCRIPTION_ID }),
    });
  });

  it('12. BILLING.SUBSCRIPTION.ACTIVATED -> nunca llama al bridge (no es un pago)', async () => {
    await handlePaypalEvent({
      event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
      resource: { id: SUBSCRIPTION_ID, status: 'ACTIVE' },
    });

    expect(registerPaypalReferralPaidPeriodMock).not.toHaveBeenCalled();
  });

  it('13. PAYMENT.SALE.REFUNDED -> billing se actualiza igual, pero el bridge nunca se llama', async () => {
    const result = await handlePaypalEvent({
      event_type: 'PAYMENT.SALE.REFUNDED',
      resource: { id: 'REFUND-1', billing_agreement_id: SUBSCRIPTION_ID, sale_id: SALE_ID },
    });

    expect(applyEventSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PAYMENT.SALE.REFUNDED', paypalSubscriptionId: SUBSCRIPTION_ID }),
    );
    expect(registerPaypalReferralPaidPeriodMock).not.toHaveBeenCalled();
    expect(result.handled).toBe(true); // el billing sigue completando su flujo normal
  });

  it('14. PAYMENT.SALE.REVERSED -> billing se actualiza igual, pero el bridge nunca se llama', async () => {
    const result = await handlePaypalEvent({
      event_type: 'PAYMENT.SALE.REVERSED',
      resource: { id: 'REVERSAL-1', billing_agreement_id: SUBSCRIPTION_ID, sale_id: SALE_ID },
    });

    expect(applyEventSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'PAYMENT.SALE.REVERSED', paypalSubscriptionId: SUBSCRIPTION_ID }),
    );
    expect(registerPaypalReferralPaidPeriodMock).not.toHaveBeenCalled();
    expect(result.handled).toBe(true);
  });
});

describe('handlePaypalEvent — Affiliate Core nunca bloquea billing', () => {
  it('10. si registerPaypalReferralPaidPeriod lanza, el webhook igual termina "handled" (billing no falla)', async () => {
    registerPaypalReferralPaidPeriodMock.mockRejectedValue(new Error('unexpected bridge crash'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await handlePaypalEvent(saleCompletedEvent());

    expect(result).toEqual({
      handled: true,
      strategy: 'event_snapshot',
      eventType: 'PAYMENT.SALE.COMPLETED',
      subscriptionId: SUBSCRIPTION_ID,
    });
    expect(applyEventSnapshotMock).toHaveBeenCalled(); // billing sí corrió
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('11. webhook duplicado (mismo sale_id, dos invocaciones) -> el bridge se invoca ambas veces con el mismo resource, la deduplicación real ocurre en la RPC/DB (ya probada), no acá', async () => {
    await handlePaypalEvent(saleCompletedEvent());
    await handlePaypalEvent(saleCompletedEvent());

    expect(registerPaypalReferralPaidPeriodMock).toHaveBeenCalledTimes(2);
    const [firstCallArgs] = registerPaypalReferralPaidPeriodMock.mock.calls[0];
    const [secondCallArgs] = registerPaypalReferralPaidPeriodMock.mock.calls[1];
    expect(firstCallArgs.resource.id).toBe(secondCallArgs.resource.id);
  });
});
