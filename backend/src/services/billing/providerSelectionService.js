const SUPPORTED_COUNTRIES = new Set([
  'CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY', 'US',
]);

function normalizeCountryCode(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return code || null;
}

export function normalizeBillingProvider(provider) {
  const raw = String(provider || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'mercadopago') {
    console.warn('[billing-provider] normalized mercadopago -> mercado_pago');
    return 'mercado_pago';
  }
  if (raw === 'mercado_pago' || raw === 'dlocal' || raw === 'paypal') return raw;
  return null;
}

/**
 * Reglas por pais (fuente: business.country_code):
 * CL -> mercado_pago
 * AR -> mercado_pago
 * OTROS -> paypal
 */
export function getPaymentOptions({ countryCode }) {
  const country = normalizeCountryCode(countryCode);
  const normalized = country && SUPPORTED_COUNTRIES.has(country) ? country : 'US';

  if (normalized === 'CL') {
    const options = Object.freeze({ primary: 'mercado_pago', secondary: ['paypal'] });
    console.info(`[billing-provider] country=${normalized} provider=${options.primary}`);
    return options;
  }
  if (normalized === 'AR') {
    const options = Object.freeze({ primary: 'mercado_pago', secondary: ['paypal'] });
    console.info(`[billing-provider] country=${normalized} provider=${options.primary}`);
    return options;
  }
  const options = Object.freeze({ primary: 'paypal', secondary: ['mercado_pago'] });
  console.info(`[billing-provider] country=${normalized} provider=${options.primary}`);
  return options;
}

export function getAvailableBillingProviders({ businessCountryCode }) {
  const options = getPaymentOptions({ countryCode: businessCountryCode });
  return [options.primary, ...options.secondary];
}

export function resolvePrimaryBillingProvider({ businessCountryCode }) {
  return getPaymentOptions({ countryCode: businessCountryCode }).primary;
}

export function isDlocalCountrySupported(countryCode) {
  const code = normalizeCountryCode(countryCode);
  return !!code && code !== 'AR';
}
