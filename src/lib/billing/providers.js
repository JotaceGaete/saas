export const PAYMENT_PROVIDERS = Object.freeze({
  MERCADO_PAGO: 'mercado_pago',
  PAYPAL: 'paypal',
  STRIPE: 'stripe',
  DLOCAL: 'dlocal',
  MANUAL: 'manual',
});

function normalize(value) {
  const v = String(value || '').trim().toUpperCase();
  return v || null;
}

export function normalizeBillingProvider(provider) {
  const raw = String(provider || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'mercadopago') {
    console.warn('[billing-provider] normalized mercadopago -> mercado_pago');
    return PAYMENT_PROVIDERS.MERCADO_PAGO;
  }
  if (raw === PAYMENT_PROVIDERS.MERCADO_PAGO) {
    return PAYMENT_PROVIDERS.MERCADO_PAGO;
  }
  if (raw === PAYMENT_PROVIDERS.DLOCAL) return PAYMENT_PROVIDERS.DLOCAL;
  if (raw === PAYMENT_PROVIDERS.PAYPAL) return PAYMENT_PROVIDERS.PAYPAL;
  if (raw === PAYMENT_PROVIDERS.STRIPE) return PAYMENT_PROVIDERS.STRIPE;
  if (raw === PAYMENT_PROVIDERS.MANUAL) return PAYMENT_PROVIDERS.MANUAL;
  return null;
}

function isTruthy(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isDlocalFeatureEnabled() {
  return isTruthy(import.meta.env?.VITE_BILLING_DLOCAL_ENABLED);
}

/**
 * LEGACY UI-only helper.
 * No usar para decidir provider real en checkout o planes.
 * La decisión final viene desde subscription-state (backend).
 */
/**
 * Opciones de pago por país ISO del negocio (o sugerencia pre-login).
 * Sin país: no asumir Chile; usar flujo internacional (dLocal/PayPal según flag).
 */
export function getPaymentOptions({ countryCode }) {
  const normalized = normalize(countryCode);
  const dlocalEnabled = isDlocalFeatureEnabled();

  if (!normalized) {
    return Object.freeze({
      primary: dlocalEnabled ? PAYMENT_PROVIDERS.DLOCAL : PAYMENT_PROVIDERS.PAYPAL,
      secondary: [],
    });
  }

  if (normalized === 'CL') {
    return Object.freeze({
      primary: PAYMENT_PROVIDERS.MERCADO_PAGO,
      secondary: [],
    });
  }
  if (normalized === 'AR') {
    return Object.freeze({
      primary: dlocalEnabled ? PAYMENT_PROVIDERS.DLOCAL : PAYMENT_PROVIDERS.PAYPAL,
      secondary: [PAYMENT_PROVIDERS.MERCADO_PAGO],
    });
  }
  if (!dlocalEnabled) {
    return Object.freeze({
      primary: PAYMENT_PROVIDERS.PAYPAL,
      secondary: [],
    });
  }
  return Object.freeze({
    primary: PAYMENT_PROVIDERS.DLOCAL,
    secondary: [PAYMENT_PROVIDERS.PAYPAL],
  });
}

export function getAvailableBillingProviders({ businessCountryCode }) {
  const options = getPaymentOptions({ countryCode: businessCountryCode });
  return [options.primary, ...options.secondary];
}
