/**
 * Proveedor de pago por país.
 * Chile: Mercado Pago (CLP). Resto: activación manual (sin pasarela activa; precios USD en UI).
 */

/** País donde el pago usa Mercado Pago. */
export const MERCADOPAGO_COUNTRY = 'CL';

/** Códigos de país soportados en la app (planes, precios, etc.). */
export const PAYMENT_COUNTRY_CODES = Object.freeze([
  'CL', 'AR', 'BO', 'BR', 'CO', 'CR', 'EC', 'ES', 'GT', 'MX', 'PA', 'PE', 'PY', 'US', 'UY',
]);

/**
 * Proveedor de pago para el país.
 * CL → Mercado Pago. Cualquier otro país → manual (contacto / activación).
 * @param {string} countryCode - Código ISO 3166-1 alpha-2 (AR, CL, MX, etc.)
 * @returns {'mercado_pago'|'manual'|null}
 */
export function getPaymentProvider(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return null;
  const code = countryCode.toUpperCase().trim();
  if (code === MERCADOPAGO_COUNTRY) return 'mercado_pago';
  if (PAYMENT_COUNTRY_CODES.includes(code)) return 'manual';
  return 'manual';
}

/**
 * Alias para consistencia (mismo comportamiento que getPaymentProvider).
 * @param {string} countryCode
 * @returns {'mercado_pago'|'manual'|null}
 */
export function getPaymentProviderByCountry(countryCode) {
  return getPaymentProvider(countryCode);
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
 * Fuera de Chile: no hay checkout automático; se solicita activación por contacto.
 * @param {string} countryCode
 * @returns {boolean}
 */
export function usesManualPlanActivation(countryCode) {
  return getPaymentProvider(countryCode) === 'manual';
}
