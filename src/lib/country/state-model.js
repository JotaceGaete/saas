import { COUNTRY_CODES } from '../../config/countryConfig';
import {
  MARKET_STATUS,
  getMarketConfigByCountry,
  getAutomaticCheckoutPolicyByStatus,
} from './market-config';

const DEFAULT_FALLBACK_COUNTRY = 'US';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return COUNTRY_CODES.includes(code) ? code : null;
}

function extractCountryCode(valueOrBusiness) {
  if (!valueOrBusiness) return null;
  if (typeof valueOrBusiness === 'string') return valueOrBusiness;
  if (typeof valueOrBusiness === 'object') {
    return (
      valueOrBusiness?.country_code ??
      valueOrBusiness?.countryCode ??
      valueOrBusiness?.country ??
      null
    );
  }
  return null;
}

export function resolveCountryState({
  businessCountryCode,
  onboardingCountryCode,
  userCountryCode,
  hostnameSuggestionCountryCode,
  fallbackCountryCode = DEFAULT_FALLBACK_COUNTRY,
} = {}) {
  const businessCountry = normalizeCountryCode(extractCountryCode(businessCountryCode));
  const onboardingCountry = normalizeCountryCode(extractCountryCode(onboardingCountryCode));
  const userMetadataCountry = normalizeCountryCode(userCountryCode);
  const hostnameSuggestion = normalizeCountryCode(hostnameSuggestionCountryCode);
  const fallback = normalizeCountryCode(fallbackCountryCode) || DEFAULT_FALLBACK_COUNTRY;

  // Prioridad pedida para billing.
  const billingCountry =
    businessCountry ||
    onboardingCountry ||
    userMetadataCountry ||
    hostnameSuggestion ||
    fallback;

  // UX: el país persistido del negocio (cuando exista) debe prevalecer sobre hostname/sugerencias.
  const uxCountry =
    businessCountry ||
    onboardingCountry ||
    hostnameSuggestion ||
    userMetadataCountry ||
    fallback;

  const marketConfig = getMarketConfigByCountry(billingCountry);
  const marketStatus = marketConfig.marketStatus;

  return {
    uxCountry,
    businessCountry,
    billingCountry,
    onboardingCountry,
    userMetadataCountry,
    hostnameSuggestionCountry: hostnameSuggestion,
    fallbackCountry: fallback,
    marketStatus,
    marketConfig,
  };
}

export function resolveBillingSetup(countryState) {
  const billingCountry = normalizeCountryCode(countryState?.billingCountry) || DEFAULT_FALLBACK_COUNTRY;
  const marketConfig = getMarketConfigByCountry(billingCountry);
  const checkoutPolicy = getAutomaticCheckoutPolicyByStatus(marketConfig.marketStatus);

  return {
    billingCountry,
    marketStatus: marketConfig.marketStatus,
    enabled: marketConfig.enabled,
    billingProvider: marketConfig.billingProvider,
    currency: marketConfig.currency,
    paymentOptions: marketConfig.paymentOptions,
    checkoutPolicy,
    marketConfig,
  };
}

export function logCountryStateDebug({
  uxCountry,
  businessCountry,
  billingCountry,
  provider,
  currency,
}) {
  if (typeof window === 'undefined') return;
  console.info(
    `[country-state] ux=${uxCountry || 'null'} business=${businessCountry || 'null'} billing=${billingCountry || 'null'} provider=${provider || 'null'} currency=${currency || 'null'}`,
  );
}
