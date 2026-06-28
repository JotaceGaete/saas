import { COUNTRY_CONFIG } from '../config/countryConfig';
import { formatCurrency } from './formatCLP';

/**
 * Currency metadata derived from COUNTRY_CONFIG — single source of truth.
 * When multiple countries share a currency (USD: EC, PA, US), the entry with
 * the most specific locale wins via an explicit override map below.
 *
 * Shape per currency code: { symbol, locale, decimals }
 */
const _meta = Object.create(null);
for (const cfg of Object.values(COUNTRY_CONFIG)) {
  if (!cfg.currency || cfg.currency in _meta) continue;
  _meta[cfg.currency] = {
    symbol: cfg.symbol ?? cfg.currency,
    locale: cfg.locale ?? 'en-US',
    decimals: cfg.decimals ?? 2,
  };
}
// USD: always format numbers in en-US style regardless of which country entry came first.
if (_meta.USD) _meta.USD.locale = 'en-US';

/**
 * Central price formatter.
 *
 * For every currency defined in COUNTRY_CONFIG the symbol, locale and decimal
 * places come from the config — no hard-coded lists here.
 * Falls back to Intl `style:'currency'` for unknown currencies.
 *
 * @param {number|string} amount
 * @param {string} currency   - ISO 4217 (CLP, ARS, NIO, USD, …)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2; sharpens symbol when
 *   multiple countries share a currency (e.g. EC vs US for USD)
 * @returns {string}
 */
export function formatPrice(amount, currency, countryCode) {
  const cur = String(currency || 'USD').trim().toUpperCase().replace(/[\s‎‏‪-‮]/g, '');
  const code = String(countryCode || '').trim().toUpperCase();
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;

  // Country-specific config takes priority over currency-level config so that
  // e.g. Ecuador (USD, "US$") vs. plain "USD" are handled correctly.
  const countryCfg = COUNTRY_CONFIG[code];
  const currencyCfg = _meta[cur];

  const symbol = countryCfg?.symbol ?? currencyCfg?.symbol;

  if (symbol !== undefined) {
    const decimals = countryCfg?.decimals ?? currencyCfg?.decimals ?? 2;
    const locale = countryCfg?.locale ?? currencyCfg?.locale ?? 'en-US';
    const numStr = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
      useGrouping: true,
    }).format(decimals === 0 ? Math.round(value) : value);
    return `${symbol} ${numStr}`;
  }

  // Unknown currency: delegate to Intl via formatCurrency (may use currency code as symbol).
  return formatCurrency(value, cur, countryCfg?.locale);
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
 * @param {string} currency    - ISO 4217 (CLP, ARS, NIO, USD, …)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2; improves symbol when currency is ambiguous
 * @returns {string}
 */
export function formatPriceCatalog(amount, currency, countryCode) {
  return formatPrice(amount, currency, countryCode);
}

/**
 * Moneda visible para pantallas administrativas del negocio.
 * Mantiene la misma regla del catálogo público.
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
 * No modifica importes; solo normaliza símbolo, separadores y decimales.
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
