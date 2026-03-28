/**
 * País del negocio (ISO) → catálogo numérico de precios de planes (montos en `prices`).
 *
 * La moneda **mostrada** en /planes depende del proveedor de facturación (`resolveBillingDisplayCurrency`
 * en `lib/billing/billingDisplayCurrency.js`), no de `wa_businesses.currency`.
 * Solo Chile y Argentina usan montos locales en catálogo cuando el proveedor es Mercado Pago (CLP / ARS).
 * Resto: montos USD de referencia; con dLocal el cargo puede liquidarse en moneda local — ver `getDlocalLocalChargeDisclaimer`.
 *
 * El catálogo del negocio (productos) sigue usando `wa_businesses.currency` (CRC, MXN, etc.).
 */

import { COUNTRY_CODES, getCountryConfig } from './countryConfig';
import { getDefaultBillingProviderForCountry } from '../lib/billing/defaultProviderByCountry';

export const PRICING_MARKET_STATUS = Object.freeze({
  ACTIVE: 'active',
  BETA: 'beta',
  COMING_SOON: 'coming_soon',
  UNSUPPORTED: 'unsupported',
});

/** @typedef {'mercado_pago'|'paypal'|'dlocal'} BillingProviderKey */

/** Precios mostrados en USD para países que no usan moneda local en la UI de planes. */
const USD_DISPLAY_PRICES = Object.freeze({
  starter: 0,
  pro: 6,
  business: 10,
});

/**
 * Overrides: marketStatus, proveedor, y precios solo donde aplica moneda local (CL, AR).
 * El resto hereda precios USD de referencia.
 */
const COUNTRY_PRICING_OVERRIDES = Object.freeze({
  CL: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: /** @type {BillingProviderKey} */ ('mercado_pago'),
    localPrices: { starter: 0, pro: 5990, business: 9990 },
  },
  AR: {
    marketStatus: PRICING_MARKET_STATUS.ACTIVE,
    defaultProvider: 'dlocal',
    localPrices: { starter: 0, pro: 8990, business: 13990 },
  },
  BO: { marketStatus: PRICING_MARKET_STATUS.BETA, defaultProvider: 'dlocal' },
  PE: { marketStatus: PRICING_MARKET_STATUS.BETA, defaultProvider: 'dlocal' },
});

const FALLBACK_COUNTRY = 'US';

const DEFAULT_OVERRIDE = Object.freeze({
  marketStatus: PRICING_MARKET_STATUS.ACTIVE,
  defaultProvider: /** @type {BillingProviderKey} */ ('dlocal'),
});

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  if (!code) return null;
  return COUNTRY_CODES.includes(code) ? code : null;
}

/** Solo CL y AR: precios de planes en moneda local en pantalla. */
export function usesLocalPlanCurrencyDisplay(countryCode) {
  const c = normalizeCountryCode(countryCode) || FALLBACK_COUNTRY;
  return c === 'CL' || c === 'AR';
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
 *   settlementCurrency: string,
 *   locale: string,
 *   defaultProvider: BillingProviderKey,
 *   prices: { starter: number, pro: number, business: number },
 *   legacyMarketCode: string,
 *   showDlocalLocalChargeNotice: boolean,
 * }}
 */
export function getCountryPricingRow(countryCode) {
  const normalized = normalizeCountryCode(countryCode) || FALLBACK_COUNTRY;
  const cfg = getCountryConfig(normalized);
  const partial = COUNTRY_PRICING_OVERRIDES[normalized] || {};
  const overrides = { ...DEFAULT_OVERRIDE, ...partial };

  const localDisplay = usesLocalPlanCurrencyDisplay(normalized);
  const settlementCurrency = String(cfg?.currency || 'USD').toUpperCase();
  const defaultProvider = getDefaultBillingProviderForCountry(normalized);

  const prices = localDisplay && overrides.localPrices
    ? { ...overrides.localPrices }
    : { ...USD_DISPLAY_PRICES };

  const currency = localDisplay ? settlementCurrency : 'USD';
  const locale = localDisplay ? (cfg?.locale || 'en-US') : 'en-US';

  const showDlocalLocalChargeNotice =
    defaultProvider === 'dlocal' &&
    !localDisplay &&
    settlementCurrency !== 'USD';

  return {
    countryCode: normalized,
    marketStatus: overrides.marketStatus || PRICING_MARKET_STATUS.ACTIVE,
    currency,
    settlementCurrency,
    locale,
    defaultProvider,
    prices,
    legacyMarketCode: getLegacyBillingMarketCode(normalized),
    showDlocalLocalChargeNotice,
  };
}

/**
 * Texto para /planes cuando el pago con dLocal se liquida en moneda local (ej. MXN) aunque el precio mostrado sea USD.
 * @param {string|null|undefined} countryCode
 * @returns {string|null}
 */
export function getDlocalLocalChargeDisclaimer(countryCode) {
  const row = getCountryPricingRow(countryCode);
  if (!row.showDlocalLocalChargeNotice) return null;
  const cfg = getCountryConfig(row.countryCode);
  const label = cfg?.currencyName ? `${row.settlementCurrency} (${cfg.currencyName})` : row.settlementCurrency;
  return `Los precios en USD son referencia. Al pagar con tarjeta u otros medios locales, el cobro se liquidará en ${label}, según el tipo de cambio y condiciones vigentes al momento de pagar.`;
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
 * Moneda usada para mostrar precios de planes (USD salvo CL/AR).
 * @param {string|null|undefined} countryCode
 * @returns {string}
 */
export function getBillingCurrencyForCountry(countryCode) {
  return getCountryPricingRow(countryCode).currency;
}
