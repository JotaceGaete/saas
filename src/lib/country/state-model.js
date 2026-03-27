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
  const rawBusinessCountryInput = extractCountryCode(businessCountryCode);
  const businessCountry = normalizeCountryCode(rawBusinessCountryInput);
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

  if (typeof window !== 'undefined' && window.__COUNTRY_STATE_DEBUG__ === true) {
    const fallbackReason = businessCountry
      ? 'businessCountry'
      : onboardingCountry
          ? 'onboardingCountry'
          : userMetadataCountry
              ? 'userMetadataCountry'
              : hostnameSuggestion
                  ? 'hostnameSuggestion'
                  : 'fallbackCountry';
    console.info('[COUNTRY_STATE_DEBUG]', {
      business: typeof businessCountryCode === 'object' && businessCountryCode
        ? {
            country_code: businessCountryCode?.country_code ?? null,
            countryCode: businessCountryCode?.countryCode ?? null,
            country: businessCountryCode?.country ?? null,
          }
        : null,
      businessCountryInput: rawBusinessCountryInput ?? null,
      businessCountryCalculated: businessCountry ?? null,
      onboardingCountry: onboardingCountry ?? null,
      userMetadataCountry: userMetadataCountry ?? null,
      hostnameSuggestion: hostnameSuggestion ?? null,
      billingCountry: billingCountry ?? null,
      uxCountry: uxCountry ?? null,
      fallbackReason,
    });
  }

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
