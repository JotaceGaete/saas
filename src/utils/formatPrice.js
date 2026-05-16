import { formatCurrency } from './formatCLP';
import { COUNTRY_CONFIG } from '../config/countryConfig';

/**
 * Currencies that use zero decimals and dot-as-thousands separator in LATAM markets.
 * For these, we build the string manually instead of relying on Intl's `style:'currency'`,
 * which produces inconsistent output (₡3 000,00, $3.000 without space, etc.).
 */
const LATAM_ZERO_DECIMAL = new Set(['CLP', 'ARS', 'CRC', 'COP', 'GTQ', 'PYG', 'UYU', 'BOB']);

/**
 * Symbol fallback when countryCode is unknown but currency is.
 * Mirrors the `symbol` field in COUNTRY_CONFIG for each currency.
 */
const CURRENCY_SYMBOL_MAP = Object.freeze({
  CLP: '$', ARS: '$', CRC: '₡', COP: '$', GTQ: 'Q', PYG: '₲', UYU: '$U', BOB: 'Bs',
});

/**
 * Central price formatter for the public catalog and preview.
 *
 * LATAM zero-decimal currencies (CLP, ARS, CRC, COP, GTQ, PYG, UYU, BOB):
 *   → "<symbol> <dot-separated-thousands>"  — no decimals, symbol separated by one space
 *   → Examples: "$ 3.000"  "₡ 150.000"  "$ 1.200.000"
 *
 * All other currencies:
 *   → delegates to Intl via formatCurrency (standard behavior, may include decimals)
 *
 * @param {number|string} amount
 * @param {string} currency   - ISO 4217 (CLP, ARS, CRC, USD, …)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2 (CL, AR, CR, …); improves symbol lookup
 * @returns {string}
 */
export function formatPrice(amount, currency, countryCode) {
  const cur = String(currency || 'USD').trim().toUpperCase().replace(/[\s\u200e\u200f\u202a-\u202e]/g, '');
  const code = String(countryCode || '').trim().toUpperCase();
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;

  if (LATAM_ZERO_DECIMAL.has(cur)) {
    // Prefer symbol from COUNTRY_CONFIG when countryCode is known;
    // fall back to the static map keyed by currency code.
    const symbol = (COUNTRY_CONFIG[code]?.symbol) ?? CURRENCY_SYMBOL_MAP[cur] ?? cur;
    // 'es-CL' consistently produces dot-as-thousands, no decimal separator.
    const numStr = new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
      useGrouping: true,
    }).format(Math.round(value));
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
 * Moneda para precios en catálogo público y checkout (cliente).
 * Si el país es AR/CL, fuerza ARS/CLP aunque en BD venga `currency` vacío o USD por defecto.
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
 * Precios para catálogo público y checkout del cliente (no billing /planes).
 * Delegates to {@link formatPrice}. Pass countryCode for correct symbol lookup.
 *
 * @param {number|string} amount
 * @param {string} currency    - ISO 4217 (CLP, ARS, CRC, USD, …)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2; improves symbol when currency is ambiguous
 * @returns {string}
 */
export function formatPriceCatalog(amount, currency, countryCode) {
  return formatPrice(amount, currency, countryCode);
}

/**
 * Moneda visible para pantallas administrativas del negocio.
 * Mantiene la misma regla del catalogo publico: si el pais persistido es CL/AR,
 * el pais manda sobre un fallback historico en USD.
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
 * No modifica importes; solo normaliza simbolo, separadores y decimales.
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
