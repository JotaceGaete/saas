/**
 * Configuración centralizada del proveedor de pago por país.
 * Chile → Mercado Pago; resto de países soportados → dLocal Go.
 * No hardcodear países en JSX: usar getPaymentProvider(countryCode).
 */

/** País que usa Mercado Pago como proveedor principal. */
export const MERCADOPAGO_COUNTRY = 'CL';

/** Países que usan dLocal Go (todos excepto Chile). */
export const DLOCAL_COUNTRIES = Object.freeze([
  'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY',
]);

/** Códigos de país soportados para pagos. */
export const PAYMENT_COUNTRY_CODES = Object.freeze([
  MERCADOPAGO_COUNTRY,
  ...DLOCAL_COUNTRIES,
]);

/**
 * Devuelve el proveedor de pago para el país.
 * @param {string} countryCode - Código ISO 3166-1 alpha-2 (AR, CL, MX, etc.)
 * @returns {'mercado_pago'|'dlocal_go'}
 */
export function getPaymentProvider(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return 'dlocal_go';
  const code = countryCode.toUpperCase().trim();
  return code === MERCADOPAGO_COUNTRY ? 'mercado_pago' : 'dlocal_go';
}

/**
 * Indica si el país usa dLocal Go.
 * @param {string} countryCode
 * @returns {boolean}
 */
export function usesDlocal(countryCode) {
  return getPaymentProvider(countryCode) === 'dlocal_go';
}

/**
 * Indica si el país usa Mercado Pago.
 * @param {string} countryCode
 * @returns {boolean}
 */
export function usesMercadoPago(countryCode) {
  return getPaymentProvider(countryCode) === 'mercado_pago';
}
