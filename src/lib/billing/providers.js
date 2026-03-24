const SUPPORTED_COUNTRIES = new Set([
  'CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY',
]);

function normalize(value) {
  const v = String(value || '').trim().toUpperCase();
  return v || null;
}

export function normalizeBillingProvider(provider) {
  const raw = String(provider || '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'mercado_pago') return 'mercadopago';
  if (raw === 'dlocal' || raw === 'mercadopago' || raw === 'paypal') return raw;
  return null;
}

function isTruthy(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

export function isDlocalFeatureEnabled() {
  return isTruthy(import.meta.env?.VITE_BILLING_DLOCAL_ENABLED);
}

export function getPaymentOptions({ countryCode }) {
  const normalized = normalize(countryCode);
  const country = normalized && SUPPORTED_COUNTRIES.has(normalized) ? normalized : 'CL';
  const dlocalEnabled = isDlocalFeatureEnabled();

  if (country === 'CL') {
    return Object.freeze({
      primary: 'mercadopago',
      secondary: dlocalEnabled ? ['dlocal', 'paypal'] : ['paypal'],
    });
  }
  if (country === 'AR') {
    return Object.freeze({
      primary: dlocalEnabled ? 'dlocal' : 'paypal',
      secondary: dlocalEnabled ? ['mercadopago'] : ['mercadopago'],
    });
  }
  if (!dlocalEnabled) {
    return Object.freeze({
      primary: 'paypal',
      secondary: [],
    });
  }
  return Object.freeze({
    primary: 'dlocal',
    secondary: ['paypal'],
  });
}

export function getAvailableBillingProviders({ businessCountryCode }) {
  const options = getPaymentOptions({ countryCode: businessCountryCode });
  return [options.primary, ...options.secondary];
}
