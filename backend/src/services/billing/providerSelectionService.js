const SUPPORTED_COUNTRIES = new Set([
  'CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY',
]);

function normalizeCountryCode(countryCode) {
  const code = String(countryCode || '').trim().toUpperCase();
  return code || null;
}

export function normalizeBillingProvider(provider) {
  const raw = String(provider || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'mercado_pago') return 'mercadopago';
  if (raw === 'dlocal' || raw === 'mercadopago' || raw === 'paypal') return raw;
  return null;
}

/**
 * Reglas por pais (fuente: business.country_code):
 * CL -> dlocal (sec: mercadopago, paypal)
 * AR -> mercadopago (sec: dlocal)
 * OTROS -> dlocal (sec: paypal)
 */
export function getPaymentOptions({ countryCode }) {
  const country = normalizeCountryCode(countryCode);
  const normalized = country && SUPPORTED_COUNTRIES.has(country) ? country : 'CL';

  if (normalized === 'CL') {
    return Object.freeze({ primary: 'dlocal', secondary: ['mercadopago', 'paypal'] });
  }
  if (normalized === 'AR') {
    return Object.freeze({ primary: 'mercadopago', secondary: ['dlocal'] });
  }
  return Object.freeze({ primary: 'dlocal', secondary: ['paypal'] });
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
