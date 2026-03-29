/**
 * Espejo de `backend/src/services/billing/billingStatusMapper.js` (BILLING_STATUSES).
 * Usar estos valores para comparar con `subscription-state.billing_status` y evitar mensajes contradictorios.
 */
export const BILLING_STATUSES = Object.freeze({
  TRIAL_WITHOUT_SUBSCRIPTION: 'trial_without_subscription',
  TRIAL_WITH_SUBSCRIPTION: 'trial_with_subscription',
  /** Fila en billing_subscriptions (DB). */
  TRIAL_SIGNUP: 'trial',
  PENDING_PAYMENT: 'pending_payment',
  SCHEDULED: 'scheduled',
  ACTIVE: 'active',
  PAST_DUE: 'past_due',
  CANCELLED: 'cancelled',
  EXPIRED: 'expired',
});

/**
 * Normaliza el string que viene del API / BD para comparaciones estables en UI.
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeBillingStatusFromApi(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  return s;
}

/**
 * Indica si el estado corresponde a período de prueba (cualquier variante).
 */
export function isTrialLikeBillingStatus(status) {
  const s = normalizeBillingStatusFromApi(status);
  return (
    s === BILLING_STATUSES.TRIAL_WITHOUT_SUBSCRIPTION
    || s === BILLING_STATUSES.TRIAL_WITH_SUBSCRIPTION
    || s === BILLING_STATUSES.TRIAL_SIGNUP
  );
}
