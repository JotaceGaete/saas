/**
 * Capa central de billing.
 * Precios y moneda por país ISO: `config/countryPricing.js` vía `getPlanPrice({ countryCode, planSlug })`.
 * Región legacy CL|INT solo compatibilidad; el negocio usa siempre `business.country_code`.
 */

export {
  BILLING_REGION_CL,
  BILLING_REGION_INT,
  PLAN_SLUGS_BILLING,
  PLAN_PRICES_BY_REGION,
  CURRENCY_BY_REGION,
  PROVIDER_BY_REGION,
} from './constants';

export { getBillingRegion, isChile, getPaymentProvider, getCurrency } from './region';
export { getPlanDisplayPrice, getPlanDisplayPriceByCountry } from './prices';
export { resolveBillingContext } from './resolve';
export { getAvailableBillingProviders } from './providers';
export { getPaymentOptions } from './providers';
export { normalizeBillingProvider } from './providers';
export { isDlocalFeatureEnabled } from './providers';
export { PAYMENT_PROVIDERS } from './providers';
export {
  buildBillingFallbackState,
  getBillingStatusSafe,
  syncBillingStateIfStale,
  getBillingUiDiagnostics,
  getBillingResolutionUiMessage,
  describeBillingProviderReason,
} from './status';
export {
  MARKET_CODES,
  BILLING_MARKETS,
  getMarketConfig,
  getPlanConfig,
  getPlanPrice,
  getPlanCurrency,
  getPaymentProvider as getPaymentProviderByMarket,
  formatMoneyByMarket,
} from './markets';
export { resolveMarket } from './market-resolver';
export {
  getCountryPricingRow,
  getPlanPriceForCountry,
  getBillingCurrencyForCountry,
  getLegacyBillingMarketCode,
  getDlocalLocalChargeDisclaimer,
  usesLocalPlanCurrencyDisplay,
  PRICING_MARKET_STATUS,
} from '../../config/countryPricing';
export {
  getProviderDisplayLabel,
  getProviderShortLabel,
  getPaymentSummaryCopy,
  getMarketNoticeCopy,
  getPlanUnavailableCopy,
} from './market-copy';
