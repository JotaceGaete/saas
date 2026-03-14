/**
 * Proveedor de pago por país.
 * Solo Chile tiene pago activo (Mercado Pago). Resto de países: próximamente.
 */

/** País donde el pago está disponible (Mercado Pago). */
export const MERCADOPAGO_COUNTRY = 'CL';

/** Códigos de país soportados en la app (planes, precios, etc.). */
export const PAYMENT_COUNTRY_CODES = Object.freeze([
  'CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY',
]);

/**
 * Proveedor de pago para el país.
 * @param {string} countryCode - Código ISO 3166-1 alpha-2 (AR, CL, MX, etc.)
 * @returns {'mercado_pago'|'paddle'|null} - 'mercado_pago' en Chile; 'paddle' fuera de Chile; null si no soportado
 */
export function getPaymentProvider(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return null;
  const code = countryCode.toUpperCase().trim();
  if (code === MERCADOPAGO_COUNTRY) return 'mercado_pago';
  if (PAYMENT_COUNTRY_CODES.includes(code)) return 'paddle';
  return null;
}

/**
 * Indica si en el país está disponible el pago (Mercado Pago).
 * @param {string} countryCode
 * @returns {boolean}
 */
export function usesMercadoPago(countryCode) {
  return getPaymentProvider(countryCode) === 'mercado_pago';
}

/**
 * Indica si en el país está disponible el pago con Paddle (fuera de Chile).
 * @param {string} countryCode
 * @returns {boolean}
 */
export function usesPaddle(countryCode) {
  return getPaymentProvider(countryCode) === 'paddle';
}
