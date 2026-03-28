import { PAYMENT_PROVIDERS } from './providers';
import { normalizeBillingProvider } from './providers';

/**
 * Moneda mostrada en /planes (precios de suscripción), según proveedor de cobro efectivo.
 * No confundir con `wa_businesses.currency` (catálogo / moneda del negocio).
 *
 * @param {{ countryCode?: string|null, provider?: string|null }} args
 * @returns {string} ISO 4217 (CLP, ARS, USD)
 */
export function resolveBillingDisplayCurrency({ countryCode, provider }) {
  const p = normalizeBillingProvider(provider);
  const c = String(countryCode || '').trim().toUpperCase();

  if (p === PAYMENT_PROVIDERS.MERCADO_PAGO) {
    if (c === 'CL') return 'CLP';
    if (c === 'AR') return 'ARS';
    return 'USD';
  }
  if (p === PAYMENT_PROVIDERS.DLOCAL || p === PAYMENT_PROVIDERS.PAYPAL) {
    return 'USD';
  }
  return 'USD';
}

/**
 * Locale para formatear montos de planes según moneda de facturación mostrada.
 * @param {string} currencyCode
 * @returns {string}
 */
export function getLocaleForBillingDisplayCurrency(currencyCode) {
  const cur = String(currencyCode || 'USD').toUpperCase();
  if (cur === 'CLP') return 'es-CL';
  if (cur === 'ARS') return 'es-AR';
  return 'en-US';
}
