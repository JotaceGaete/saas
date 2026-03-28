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
      valueOrBusiness?.countryCodeDb ??
      valueOrBusiness?.country_code ??
      valueOrBusiness?.routingCountryCode ??
      valueOrBusiness?.countryCode ??
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

  // Billing: solo país persistido en BD (columna country_code). Sin negocio configurado → null (no cobros/planes reales).
  const billingCountry = businessCountry || null;

  // UX: sugerencias visuales; sin persistir. Sin país en BD → hostname/metadata; último recurso fallback (no se guarda en BD).
  const uxCountry =
    businessCountry ||
    onboardingCountry ||
    userMetadataCountry ||
    hostnameSuggestion ||
    fallback;

  if (typeof window !== 'undefined' && (window.__COUNTRY_STATE_DEBUG__ === true || window.__VTLK_COUNTRY_DEBUG__ === true)) {
    const fallbackReason = businessCountry
      ? 'businessCountry'
      : onboardingCountry
          ? 'onboardingCountry'
          : userMetadataCountry
              ? 'userMetadataCountry'
              : hostnameSuggestion
                  ? 'hostnameSuggestion'
                  : 'fallbackCountry';
    console.info(window.__VTLK_COUNTRY_DEBUG__ ? '[VTLK_COUNTRY_RESOLVER]' : '[COUNTRY_STATE_DEBUG]', {
      neutralNoDbCountry: !businessCountry,
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
  const bc = normalizeCountryCode(countryState?.billingCountry);
  if (!bc) {
    return {
      billingCountry: null,
      marketStatus: null,
      enabled: false,
      billingProvider: null,
      currency: null,
      paymentOptions: [],
      checkoutPolicy: {
        allowed: false,
        message: 'Configura el país de tu negocio en Configuración para ver planes y pagos.',
      },
      marketConfig: null,
    };
  }
  const marketConfig = getMarketConfigByCountry(bc);
  const checkoutPolicy = getAutomaticCheckoutPolicyByStatus(marketConfig.marketStatus);

  return {
    billingCountry: bc,
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
