import { TRIAL_DURATION_DAYS } from '../../constants/trial';
import { PAYMENT_PROVIDERS } from './providers';

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

export const BILLING_MARKETS = Object.freeze({
  [MARKET_CODES.CL]: {
    code: MARKET_CODES.CL,
    currency: 'CLP',
    locale: 'es-CL',
    defaultProvider: PAYMENT_PROVIDERS.MERCADO_PAGO,
    comingSoon: false,
    plans: {
      ...BASE_PLANS,
      pro: { ...BASE_PLANS.pro, amount: 5990 },
      business: { ...BASE_PLANS.business, amount: 9990 },
    },
  },
  [MARKET_CODES.AR]: {
    code: MARKET_CODES.AR,
    currency: 'ARS',
    locale: 'es-AR',
    // Provider técnico actual para AR (no se expone marca en UI)
    defaultProvider: PAYMENT_PROVIDERS.DLOCAL,
    comingSoon: false,
    plans: {
      ...BASE_PLANS,
      pro: { ...BASE_PLANS.pro, amount: 8990 },
      business: { ...BASE_PLANS.business, amount: 13990 },
    },
  },
  [MARKET_CODES.INTL]: {
    code: MARKET_CODES.INTL,
    currency: 'USD',
    locale: 'en-US',
    defaultProvider: PAYMENT_PROVIDERS.DLOCAL,
    comingSoon: false,
    plans: {
      ...BASE_PLANS,
      pro: { ...BASE_PLANS.pro, amount: 6 },
      business: { ...BASE_PLANS.business, amount: 10 },
    },
  },
});

export function getMarketConfig(marketCode) {
  const code = String(marketCode || '').trim().toUpperCase();
  return BILLING_MARKETS[code] || BILLING_MARKETS[MARKET_CODES.INTL];
}

export function getPlanConfig({ marketCode, planSlug }) {
  const market = getMarketConfig(marketCode);
  const slug = String(planSlug || '').trim().toLowerCase();
  return market.plans?.[slug] || market.plans.starter;
}

export function getPlanPrice({ marketCode, planSlug }) {
  const plan = getPlanConfig({ marketCode, planSlug });
  return Number.isFinite(Number(plan?.amount)) ? Number(plan.amount) : null;
}

export function getPlanCurrency({ marketCode }) {
  return getMarketConfig(marketCode).currency;
}

export function getPaymentProvider({ marketCode }) {
  return getMarketConfig(marketCode).defaultProvider;
}

export function formatMoneyByMarket({ amount, marketCode, currency, locale }) {
  const market = getMarketConfig(marketCode);
  const resolvedCurrency = String(currency || market.currency || 'USD').toUpperCase();
  const resolvedLocale = locale || market.locale || 'es-CL';
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return '-';
  return new Intl.NumberFormat(resolvedLocale, {
    style: 'currency',
    currency: resolvedCurrency,
    maximumFractionDigits: resolvedCurrency === 'CLP' || resolvedCurrency === 'ARS' ? 0 : 2,
  }).format(numeric);
}
