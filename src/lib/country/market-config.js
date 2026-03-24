import { COUNTRY_CODES, getCountryConfig } from '../../config/countryConfig';
import { getPaymentOptions, normalizeBillingProvider } from '../billing/providers';

export const MARKET_STATUS = Object.freeze({
  ACTIVE: 'active',
  BETA: 'beta',
  COMING_SOON: 'coming_soon',
  UNSUPPORTED: 'unsupported',
});

const DEFAULT_COUNTRY = 'US';

const COUNTRY_MARKET_CONFIG = Object.freeze({
  CL: { marketStatus: MARKET_STATUS.ACTIVE, enabled: true },
  AR: { marketStatus: MARKET_STATUS.ACTIVE, enabled: true },
  PE: { marketStatus: MARKET_STATUS.BETA, enabled: true },
  // Ejemplos listos para habilitación controlada por país:
  // XX: { marketStatus: MARKET_STATUS.COMING_SOON, enabled: false },
  // YY: { marketStatus: MARKET_STATUS.UNSUPPORTED, enabled: false },
});

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return COUNTRY_CODES.includes(code) ? code : null;
}

export function getMarketConfigByCountry(countryCode) {
  const normalizedCountry = normalizeCountryCode(countryCode) || DEFAULT_COUNTRY;
  const base = COUNTRY_MARKET_CONFIG[normalizedCountry] || {
    marketStatus: MARKET_STATUS.ACTIVE,
    enabled: true,
  };
  const countryCfg = getCountryConfig(normalizedCountry);
  const paymentOptions = getPaymentOptions({ countryCode: normalizedCountry });
  const billingProvider = normalizeBillingProvider(base.billingProvider || paymentOptions?.primary) || 'manual';

  return {
    countryCode: normalizedCountry,
    marketStatus: base.marketStatus,
    enabled: base.enabled !== false,
    currency: base.currency || countryCfg?.currency || 'USD',
    billingProvider,
    paymentOptions,
  };
}

export function getAutomaticCheckoutPolicyByStatus(marketStatus) {
  const status = String(marketStatus || '').trim().toLowerCase();
  if (status === MARKET_STATUS.COMING_SOON || status === MARKET_STATUS.UNSUPPORTED) {
    return {
      allowed: false,
      message: 'Este método de pago estará disponible próximamente para tu mercado.',
    };
  }
  return { allowed: true, message: null };
}
