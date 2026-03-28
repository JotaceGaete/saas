import { COUNTRY_CODES } from '../../config/countryConfig';
import { getCountryPricingRow } from '../../config/countryPricing';
import { getPaymentOptions, normalizeBillingProvider } from '../billing/providers';

export const MARKET_STATUS = Object.freeze({
  ACTIVE: 'active',
  BETA: 'beta',
  COMING_SOON: 'coming_soon',
  UNSUPPORTED: 'unsupported',
});

const DEFAULT_COUNTRY = 'US';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return COUNTRY_CODES.includes(code) ? code : null;
}

export function getMarketConfigByCountry(countryCode) {
  const normalizedCountry = normalizeCountryCode(countryCode) || DEFAULT_COUNTRY;
  const pricingRow = getCountryPricingRow(normalizedCountry);
  const paymentOptions = getPaymentOptions({ countryCode: normalizedCountry });
  const billingProvider =
    normalizeBillingProvider(pricingRow.defaultProvider) || normalizeBillingProvider(paymentOptions?.primary) || 'manual';

  return {
    countryCode: normalizedCountry,
    marketStatus: pricingRow.marketStatus,
    enabled: pricingRow.marketStatus !== 'coming_soon' && pricingRow.marketStatus !== 'unsupported',
    currency: pricingRow.currency,
    locale: pricingRow.locale,
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
