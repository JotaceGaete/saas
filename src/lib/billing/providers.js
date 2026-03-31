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

export function isDlocalFeatureEnabled() {
  return false;
}

/**
 * LEGACY UI-only helper.
 * No usar para decidir provider real en checkout o planes.
 * La decisión final viene desde subscription-state (backend).
 */
/**
 * Opciones de pago por país ISO del negocio (o sugerencia pre-login).
 * Sin país: usar flujo internacional por defecto (PayPal).
 */
export function getPaymentOptions({ countryCode }) {
  const normalized = normalize(countryCode);

  if (!normalized) {
    return Object.freeze({
      primary: PAYMENT_PROVIDERS.PAYPAL,
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
      primary: PAYMENT_PROVIDERS.MERCADO_PAGO,
      secondary: [PAYMENT_PROVIDERS.PAYPAL],
    });
  }
  return Object.freeze({
    primary: PAYMENT_PROVIDERS.PAYPAL,
    secondary: [PAYMENT_PROVIDERS.MERCADO_PAGO],
  });
}

export function getAvailableBillingProviders({ businessCountryCode }) {
  const options = getPaymentOptions({ countryCode: businessCountryCode });
  return [options.primary, ...options.secondary];
}
