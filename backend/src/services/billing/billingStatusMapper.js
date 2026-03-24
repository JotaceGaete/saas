export const BILLING_STATUSES = Object.freeze({
  TRIAL_WITHOUT_SUBSCRIPTION: 'trial_without_subscription',
  TRIAL_WITH_SUBSCRIPTION: 'trial_with_subscription',
  PENDING_PAYMENT: 'pending_payment',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

const PAYPAL_STATUS_MAP = Object.freeze({
  APPROVAL_PENDING: BILLING_STATUSES.PENDING_PAYMENT,
  APPROVED: BILLING_STATUSES.SCHEDULED,
  ACTIVE: BILLING_STATUSES.ACTIVE,
  SUSPENDED: BILLING_STATUSES.PAST_DUE,
  CANCELLED: BILLING_STATUSES.CANCELLED,
  EXPIRED: BILLING_STATUSES.EXPIRED,
});

export function mapPaypalStatus(providerStatus) {
  const normalized = String(providerStatus || '').trim().toUpperCase();
  if (!normalized) return BILLING_STATUSES.PENDING_PAYMENT;
  return PAYPAL_STATUS_MAP[normalized] || BILLING_STATUSES.PENDING_PAYMENT;
}

export function mapDlocalStatus(providerStatus) {
  const normalized = String(providerStatus || '').trim().toUpperCase();
  if (!normalized) return BILLING_STATUSES.PENDING_PAYMENT;
  if (['PAID', 'APPROVED', 'AUTHORIZED'].includes(normalized)) return BILLING_STATUSES.ACTIVE;
  if (['PENDING', 'IN_PROCESS', 'WAITING_TRANSFER', 'BANK_TRANSFER_PENDING'].includes(normalized)) {
    return BILLING_STATUSES.PENDING_PAYMENT;
  }
  if (['FAILED', 'REJECTED'].includes(normalized)) return BILLING_STATUSES.PAST_DUE;
  if (['CANCELLED'].includes(normalized)) return BILLING_STATUSES.CANCELLED;
  if (['EXPIRED'].includes(normalized)) return BILLING_STATUSES.EXPIRED;
  return BILLING_STATUSES.PENDING_PAYMENT;
}

export function mapProviderStatus(provider, providerStatus) {
  const rawProvider = String(provider || '').trim().toLowerCase();
  const normalizedProvider = rawProvider === 'mercadopago' ? 'mercado_pago' : rawProvider;
  if (rawProvider === 'mercadopago') {
    console.warn('[billing-provider] normalized mercadopago -> mercado_pago');
  }
  if (normalizedProvider === 'paypal') return mapPaypalStatus(providerStatus);
  if (normalizedProvider === 'dlocal') {
    return mapDlocalStatus(providerStatus);
  }
  if (normalizedProvider === 'mercado_pago') {
    // El estado detallado de MP sigue en su flujo actual; usamos base neutral.
    return BILLING_STATUSES.PENDING_PAYMENT;
  }
  return BILLING_STATUSES.PENDING_PAYMENT;
}

export function isTerminalBillingStatus(status) {
  return status === BILLING_STATUSES.CANCELLED || status === BILLING_STATUSES.EXPIRED;
}
