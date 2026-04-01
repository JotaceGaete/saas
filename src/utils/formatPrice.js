import { formatCurrency } from './formatCLP';

/**
 * Precios solo para catálogo público y checkout del cliente (no billing /planes).
 * CLP y ARS: sin decimales; resto delega en {@link formatCurrency}.
 *
 * @param {number|string} amount
 * @param {string} currency - ISO 4217 (CLP, ARS, USD, …)
 * @returns {string}
 */
export function formatPriceCatalog(amount, currency) {
  const c = String(currency || 'USD').toUpperCase();
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;

  if (c === 'CLP' || c === 'ARS') {
    const locale = c === 'CLP' ? 'es-CL' : 'es-AR';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: c,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  }

  return formatCurrency(value, c);
}
