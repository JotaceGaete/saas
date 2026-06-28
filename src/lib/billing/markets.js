import { TRIAL_DURATION_DAYS } from '../../constants/trial';
import {
  getCountryPricingRow,
  getPlanPriceForCountry,
  getLegacyBillingMarketCode,
} from '../../config/countryPricing';
import { PAYMENT_PROVIDERS } from './providers';
import { COUNTRY_CONFIG } from '../../config/countryConfig';

export const MARKET_CODES = Object.freeze({
  CL: 'CL',
  AR: 'AR',
  INTL: 'INTL',
});

const BASE_PLANS = Object.freeze({
  starter: { slug: 'starter', enabled: true, purchasable: false, contactOnly: false, amount: 0, badge: null, trialDays: 0 },
  control: { slug: 'control', enabled: false, purchasable: false, contactOnly: true, amount: null, badge: null, trialDays: 0 },
  pro: { slug: 'pro', enabled: true, purchasable: true, contactOnly: false, amount: null, badge: 'Más popular', trialDays: TRIAL_DURATION_DAYS },
  business: { slug: 'business', enabled: true, purchasable: true, contactOnly: false, amount: null, badge: null, trialDays: TRIAL_DURATION_DAYS },
});

function mapPricingProviderToPayment(row) {
  const key = row?.defaultProvider;
  if (key === 'mercado_pago') return PAYMENT_PROVIDERS.MERCADO_PAGO;
  if (key === 'paypal') return PAYMENT_PROVIDERS.PAYPAL;
  return PAYMENT_PROVIDERS.PAYPAL;
}

function buildMarketBlockFromCountry(isoCountry) {
  const row = getCountryPricingRow(isoCountry);
  const legacy = row.legacyMarketCode === 'CL' ? MARKET_CODES.CL : row.legacyMarketCode === 'AR' ? MARKET_CODES.AR : MARKET_CODES.INTL;
  return {
    code: legacy,
    currency: row.currency,
    locale: row.locale,
    defaultProvider: mapPricingProviderToPayment(row),
    comingSoon: false,
    plans: {
      ...BASE_PLANS,
      pro: { ...BASE_PLANS.pro, amount: row.prices.pro },
      business: { ...BASE_PLANS.business, amount: row.prices.business },
    },
  };
}

/** Mercados legacy (CL | AR | INTL) derivados de país ISO — solo compatibilidad. */
export const BILLING_MARKETS = Object.freeze({
  [MARKET_CODES.CL]: buildMarketBlockFromCountry('CL'),
  [MARKET_CODES.AR]: buildMarketBlockFromCountry('AR'),
  [MARKET_CODES.INTL]: buildMarketBlockFromCountry('US'),
});

function resolveIsoFromArgs({ marketCode, countryCode }) {
  if (countryCode != null && String(countryCode).trim() !== '') {
    return getCountryPricingRow(countryCode).countryCode;
  }
  const legacy = String(marketCode || '').trim().toUpperCase();
  if (legacy === MARKET_CODES.CL) return 'CL';
  if (legacy === MARKET_CODES.AR) return 'AR';
  return 'US';
}

export function getMarketConfig(marketCode) {
  const code = String(marketCode || '').trim().toUpperCase();
  return BILLING_MARKETS[code] || BILLING_MARKETS[MARKET_CODES.INTL];
}

/**
 * Config de plan: preferir `countryCode` (negocio). `marketCode` solo compatibilidad.
 */
export function getPlanConfig({ marketCode, planSlug, countryCode }) {
  const iso = resolveIsoFromArgs({ marketCode, countryCode });
  const row = getCountryPricingRow(iso);
  const legacy = row.legacyMarketCode === 'CL' ? MARKET_CODES.CL : row.legacyMarketCode === 'AR' ? MARKET_CODES.AR : MARKET_CODES.INTL;
  const block = {
    code: legacy,
    currency: row.currency,
    locale: row.locale,
    defaultProvider: mapPricingProviderToPayment(row),
    plans: {
      ...BASE_PLANS,
      pro: { ...BASE_PLANS.pro, amount: row.prices.pro },
      business: { ...BASE_PLANS.business, amount: row.prices.business },
    },
  };
  const slug = String(planSlug || '').trim().toLowerCase();
  return block.plans?.[slug] || block.plans.starter;
}

export function getPlanPrice({ marketCode, planSlug, countryCode }) {
  if (countryCode != null && String(countryCode).trim() !== '') {
    return getPlanPriceForCountry(countryCode, planSlug);
  }
  const plan = getPlanConfig({ marketCode, planSlug });
  return Number.isFinite(Number(plan?.amount)) ? Number(plan.amount) : null;
}

export function getPlanCurrency({ marketCode, countryCode }) {
  const iso = resolveIsoFromArgs({ marketCode, countryCode });
  return getCountryPricingRow(iso).currency;
}

export function getPaymentProvider({ marketCode, countryCode }) {
  const iso = resolveIsoFromArgs({ marketCode, countryCode });
  return mapPricingProviderToPayment(getCountryPricingRow(iso));
}

// Derived from COUNTRY_CONFIG — single source of truth for decimal rules.
const _zeroDecimalCurrencies = new Set(
  Object.values(COUNTRY_CONFIG).filter(c => c.decimals === 0).map(c => c.currency),
);

function maxFractionDigitsForCurrency(currency) {
  return _zeroDecimalCurrencies.has(String(currency || '').toUpperCase()) ? 0 : 2;
}

export function formatMoneyByMarket({ amount, marketCode, countryCode, currency, locale }) {
  const iso = countryCode != null && String(countryCode).trim() !== ''
    ? getCountryPricingRow(countryCode).countryCode
    : resolveIsoFromArgs({ marketCode });
  const row = getCountryPricingRow(iso);
  const resolvedCurrency = String(currency || row.currency || 'USD').toUpperCase();
  const resolvedLocale = locale || row.locale || 'en-US';
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: resolvedCurrency,
    minimumFractionDigits: maxFractionDigitsForCurrency(resolvedCurrency),
    maximumFractionDigits: maxFractionDigitsForCurrency(resolvedCurrency),
  }).format(numeric);
}

export { getLegacyBillingMarketCode };
