const PAYPAL_TO_INTERNAL_STATUS = Object.freeze({
  APPROVAL_PENDING: 'pending_approval',
  APPROVED: 'pending_activation',
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

const EVENT_TO_PAYPAL_STATUS = Object.freeze({
  'BILLING.SUBSCRIPTION.CREATED': 'APPROVAL_PENDING',
  'BILLING.SUBSCRIPTION.ACTIVATED': 'ACTIVE',
  'BILLING.SUBSCRIPTION.UPDATED': null,
  'BILLING.SUBSCRIPTION.SUSPENDED': 'SUSPENDED',
  'BILLING.SUBSCRIPTION.CANCELLED': 'CANCELLED',
  'BILLING.SUBSCRIPTION.EXPIRED': 'EXPIRED',
  'PAYMENT.SALE.COMPLETED': null,
  'PAYMENT.SALE.REFUNDED': null,
  'PAYMENT.SALE.REVERSED': null,
});

function normalizePaypalStatus(rawStatus) {
  const value = String(rawStatus || '').trim().toUpperCase();
  return value || null;
}

export function mapPaypalStatusToInternal(paypalStatus) {
  const normalized = normalizePaypalStatus(paypalStatus);
  if (!normalized) return 'unknown';
  return PAYPAL_TO_INTERNAL_STATUS[normalized] || 'unknown';
}

export function inferPaypalStatusFromEventType(eventType) {
  const key = String(eventType || '').trim().toUpperCase();
  if (!key) return null;
  return EVENT_TO_PAYPAL_STATUS[key] ?? null;
}

export function mapEventTypeToInternalStatus(eventType) {
  const paypalStatus = inferPaypalStatusFromEventType(eventType);
  if (!paypalStatus) return null;
  return mapPaypalStatusToInternal(paypalStatus);
}

export function normalizePaypalEventType(eventType) {
  return String(eventType || '').trim().toUpperCase() || null;
}

