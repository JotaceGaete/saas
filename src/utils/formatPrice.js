import { formatCurrency } from './formatCLP';
import { COUNTRY_CONFIG } from '../config/countryConfig';

/**
 * Currencies that use zero decimals and dot-as-thousands separator in LATAM markets.
 * For these, we build the string manually instead of relying on Intl's `style:'currency'`,
 * which produces inconsistent output across Node.js/browser ICU versions.
 */
const LATAM_ZERO_DECIMAL = new Set(['CLP', 'ARS', 'CRC', 'COP', 'GTQ', 'PYG', 'UYU', 'BOB']);

/**
 * Currencies that use 2 decimals but whose symbol Intl renders without a space
 * in some Node.js/ICU versions (e.g. "C$160.00" instead of "C$ 160.00").
 * We format these manually to guarantee consistent output across all environments.
 */
const LATAM_TWO_DECIMAL = new Set(['NIO', 'HNL', 'DOP']);

/**
 * Symbol fallback when countryCode is unknown but currency is.
 * Mirrors the `symbol` field in COUNTRY_CONFIG for each currency.
 */
const CURRENCY_SYMBOL_MAP = Object.freeze({
  CLP: '$', ARS: '$', CRC: '₡', COP: '$', GTQ: 'Q', PYG: '₲', UYU: '$U', BOB: 'Bs',
  NIO: 'C$', HNL: 'L', DOP: 'RD$',
});

/**
 * Central price formatter for the public catalog and preview.
 *
 * LATAM zero-decimal (CLP, ARS, CRC, COP, GTQ, PYG, UYU, BOB):
 *   -> "<symbol> <dot-separated-thousands>"  — no decimals
 *   -> Examples: "$ 3.000"  "C$ 150.000"  "$ 1.200.000"
 *
 * LATAM two-decimal (NIO, HNL, DOP):
 *   -> "<symbol> <comma-thousands>.<2 decimals>"
 *   -> Examples: "C$ 160.00"  "L 100.00"  "RD$ 100.00"
 *
 * USD:
 *   -> "US$ <en-US formatted>"
 *
 * All other currencies:
 *   -> delegates to Intl via formatCurrency (standard behavior)
 *
 * @param {number|string} amount
 * @param {string} currency   - ISO 4217 (CLP, ARS, NIO, USD, ...)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2 (CL, AR, NI, ...); improves symbol lookup
 * @returns {string}
 */
export function formatPrice(amount, currency, countryCode) {
  const cur = String(currency || 'USD').trim().toUpperCase().replace(/[\s‎‏‪-‮]/g, '');
  const code = String(countryCode || '').trim().toUpperCase();
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;

  if (LATAM_ZERO_DECIMAL.has(cur)) {
    const symbol = (COUNTRY_CONFIG[code]?.symbol) ?? CURRENCY_SYMBOL_MAP[cur] ?? cur;
    const numStr = new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(Math.round(value));
    return `${symbol} ${numStr}`;
  }

  if (LATAM_TWO_DECIMAL.has(cur)) {
    const symbol = (COUNTRY_CONFIG[code]?.symbol) ?? CURRENCY_SYMBOL_MAP[cur] ?? cur;
    const numStr = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value);
    return `${symbol} ${numStr}`;
  }

  if (cur === 'USD') {
    const numStr = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value);
    return `US$ ${numStr}`;
  }

  // Non-LATAM: standard Intl currency formatting.
  const locale = COUNTRY_CONFIG[code]?.locale;
  return formatCurrency(value, cur, locale);
}

/**
 * Moneda para precios en catalogo publico y checkout (cliente).
 * Si el pais es AR/CL, fuerza ARS/CLP aunque en BD venga `currency` vacio o USD por defecto.
 *
 * @param {object|null|undefined} business - wa_business mapeado
 * @param {{ currencyCode?: string|null }|null|undefined} catalogMoney - resultado de getBusinessLocale(business)
 * @returns {string} ISO 4217
 */
export function resolveCatalogCurrency(business, catalogMoney) {
  const explicit = String(business?.currency ?? '').trim().toUpperCase();
  const fromLocale = String(catalogMoney?.currencyCode ?? '').trim().toUpperCase();
  const iso = String(
    business?.countryCodeDb ?? business?.country_code ?? business?.countryCode ?? business?.routingCountryCode ?? '',
  )
    .trim()
    .toUpperCase();

  if (iso === 'AR') return 'ARS';
  if (iso === 'CL') return 'CLP';

  if (explicit) return explicit;
  if (fromLocale) return fromLocale;

  const legacy = String(business?.country ?? '').toLowerCase();
  if (legacy.includes('argentina')) return 'ARS';
  if (legacy.includes('chile')) return 'CLP';

  return explicit || fromLocale || 'USD';
}

/**
 * Precios para catalogo publico y checkout del cliente (no billing /planes).
 * Delegates to {@link formatPrice}. Pass countryCode for correct symbol lookup.
 *
 * @param {number|string} amount
 * @param {string} currency    - ISO 4217 (CLP, ARS, CRC, USD, ...)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2; improves symbol when currency is ambiguous
 * @returns {string}
 */
export function formatPriceCatalog(amount, currency, countryCode) {
  return formatPrice(amount, currency, countryCode);
}

/**
 * Moneda visible para pantallas administrativas del negocio.
 *
 * @param {object|null|undefined} business
 * @param {{ currencyCode?: string|null }|null|undefined} businessLocale
 * @returns {string}
 */
export function resolveBusinessCurrency(business, businessLocale) {
  return resolveCatalogCurrency(business, businessLocale);
}

/**
 * Formato visual de montos para dashboard y pantallas administrativas.
 *
 * @param {number|string} amount
 * @param {object|null|undefined} business
 * @param {{ currencyCode?: string|null, countryCode?: string|null }|null|undefined} businessLocale
 * @returns {string}
 */
export function formatBusinessCurrency(amount, business, businessLocale) {
  const currency = resolveBusinessCurrency(business, businessLocale);
  const countryCode = businessLocale?.countryCode
    ?? business?.countryCodeDb
    ?? business?.country_code
    ?? business?.countryCode
    ?? business?.routingCountryCode
    ?? null;
  return formatPrice(amount, currency, countryCode);
}
