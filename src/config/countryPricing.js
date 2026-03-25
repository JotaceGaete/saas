/**
 * Fuente única: país del negocio (ISO) → marketStatus, moneda de facturación/display, precios de planes.
 * Todo pricing de producto debe leer desde aquí usando business.country_code, no hostname ni UI.
 *
 * Precios alineados con backend dLocal donde aplica (subscriptionService PLAN_PRICES_BY_CURRENCY).
 * CL usa Mercado Pago (CLP); AR mantiene montos UI históricos hasta unificar con cobro real.
 */

import { COUNTRY_CODES, getCountryConfig } from './countryConfig';

export const PRICING_MARKET_STATUS = Object.freeze({
  ACTIVE: 'active',
  BETA: 'beta',
  COMING_SOON: 'coming_soon',
  UNSUPPORTED: 'unsupported',
});

/** @typedef {'mercado_pago'|'paypal'|'dlocal'} BillingProviderKey */

/**
 * Overrides por país: marketStatus, precios (en la moneda `currency`), proveedor por defecto.
 * `currency` y `locale` se toman de COUNTRY_CONFIG si no se pasan.
 */
const COUNTRY_PRICING_OVERRIDES = Object.freeze({
  CL: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    /** @type {BillingProviderKey} */
    defaultProvider: 'mercado_pago',
    prices: { starter: 0, pro: 5990, business: 9990 },
  },
  AR: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 8990, business: 13990 },
  },
  BO: {
    marketStatus: PRICING_MARKET_STATUS.BETA,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 42, business: 70 },
  },
  CO: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 25000, business: 42000 },
  },
  CR: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 3200, business: 5400 },
  },
  EC: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 6, business: 10 },
  },
  GT: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 45, business: 75 },
  },
  PA: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 6, business: 10 },
  },
  PE: {
    marketStatus: PRICING_MARKET_STATUS.BETA,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 25, business: 42 },
  },
  PY: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 45000, business: 76000 },
  },
  UY: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 240, business: 400 },
  },
  MX: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 120, business: 200 },
  },
  ES: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 6, business: 10 },
  },
  US: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    prices: { starter: 0, pro: 6, business: 10 },
  },
});

const FALLBACK_COUNTRY = 'US';

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return COUNTRY_CODES.includes(code) ? code : null;
}

/**
 * Código de mercado legacy (CL | AR | INTL) para copy/UI que aún discrimina bloques comerciales.
 * @param {string|null|undefined} countryCode
 */
export function getLegacyBillingMarketCode(countryCode) {
  const c = normalizeCountryCode(countryCode) || FALLBACK_COUNTRY;
  if (c === 'CL') return 'CL';
  if (c === 'AR') return 'AR';
  return 'INTL';
}

/**
 * @param {string|null|undefined} countryCode
 * @returns {{
 *   countryCode: string,
 *   marketStatus: string,
 *   currency: string,
 *   locale: string,
 *   defaultProvider: BillingProviderKey,
 *   prices: { starter: number, pro: number, business: number },
 *   legacyMarketCode: string,
 * }}
 */
export function getCountryPricingRow(countryCode) {
  const normalized = normalizeCountryCode(countryCode) || FALLBACK_COUNTRY;
  const cfg = getCountryConfig(normalized);
  const overrides = COUNTRY_PRICING_OVERRIDES[normalized] || COUNTRY_PRICING_OVERRIDES[FALLBACK_COUNTRY];
  return {
    countryCode: normalized,
    marketStatus: overrides.marketStatus || PRICING_MARKET_STATUS.ACTIVE,
    currency: String(cfg?.currency || 'USD').toUpperCase(),
    locale: cfg?.locale || 'en-US',
    defaultProvider: overrides.defaultProvider || 'dlocal',
    prices: { ...overrides.prices },
    legacyMarketCode: getLegacyBillingMarketCode(normalized),
  };
}

/**
 * @param {string|null|undefined} countryCode
 * @param {string} planSlug
 * @returns {number}
 */
export function getPlanPriceForCountry(countryCode, planSlug) {
  const row = getCountryPricingRow(countryCode);
  const slug = String(planSlug || '').trim().toLowerCase();
  const n = row.prices[slug];
  return Number.isFinite(Number(n)) ? Number(n) : 0;
}

/**
 * @param {string|null|undefined} countryCode
 * @returns {string}
 */
export function getBillingCurrencyForCountry(countryCode) {
  return getCountryPricingRow(countryCode).currency;
}
