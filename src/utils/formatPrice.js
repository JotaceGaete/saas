import { formatCurrency } from './formatCLP';

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
 * Precios solo para catálogo público y checkout del cliente (no billing /planes).
 * CLP y ARS: sin decimales; resto delega en {@link formatCurrency}.
 *
 * @param {number|string} amount
 * @param {string} currency - ISO 4217 (CLP, ARS, USD, …)
 * @returns {string}
 */
export function formatPriceCatalog(amount, currency) {
  const c = String(currency || 'USD')
    .trim()
    .toUpperCase()
    .replace(/[\s\u200e\u200f\u202a-\u202e]/g, '');
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;

  if (c === 'CLP' || c === 'ARS') {
    const locale = c === 'CLP' ? 'es-CL' : 'es-AR';
    let out = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: c,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
    // Refuerzo: algunos entornos/ICU aún muestran centavos para ARS/CLP
    out = out.replace(/,00(\s*)$/u, '$1').replace(/\.00(\s*)$/u, '$1');
    return out;
  }

  return formatCurrency(value, c);
}
