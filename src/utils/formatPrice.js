import { formatCatalogPrice } from './formatPriceByCountry';

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
 * Reglas por país: ver {@link formatCatalogPrice} en formatPriceByCountry.ts
 *
 * @param {number|string} amount
 * @param {string} currency - ISO 4217 (CLP, ARS, USD, …)
 * @param {string|null|undefined} countryCode - ISO país; prioridad sobre solo moneda
 * @returns {string}
 */
export function formatPriceCatalog(amount, currency, countryCode) {
  return formatCatalogPrice(amount, countryCode ?? null, currency ?? null);
}
