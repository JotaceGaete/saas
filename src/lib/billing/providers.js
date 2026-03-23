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

export function getPaymentOptions({ countryCode }) {
  const normalized = normalize(countryCode);
  const country = normalized && SUPPORTED_COUNTRIES.has(normalized) ? normalized : 'CL';

  if (country === 'CL') {
    return Object.freeze({
      primary: 'dlocal',
      secondary: ['mercadopago', 'paypal'],
    });
  }
  if (country === 'AR') {
    return Object.freeze({
      primary: 'mercadopago',
      secondary: ['dlocal'],
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
