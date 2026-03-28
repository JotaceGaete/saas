import { COUNTRY_CODES } from '../../config/countryConfig';
import { PAYMENT_PROVIDERS } from './providers';

/**
 * Proveedor de cobro por defecto según país del negocio (producto).
 * CL / AR → Mercado Pago; resto de ISO soportados → dLocal.
 * PayPal u otros solo vía reglas explícitas en otro lugar (no mezclar aquí).
 *
 * @param {string|null|undefined} countryCode
 * @returns {typeof PAYMENT_PROVIDERS[keyof typeof PAYMENT_PROVIDERS]}
 */
export function getDefaultBillingProviderForCountry(countryCode) {
  const c = String(countryCode || '').trim().toUpperCase();
  if (!c || !COUNTRY_CODES.includes(c)) return PAYMENT_PROVIDERS.DLOCAL;
  if (c === 'CL' || c === 'AR') return PAYMENT_PROVIDERS.MERCADO_PAGO;
  return PAYMENT_PROVIDERS.DLOCAL;
}

/** Alias explícito para reglas de producto (planes, checkout, fallbacks). */
export const resolveBillingProvider = getDefaultBillingProviderForCountry;
