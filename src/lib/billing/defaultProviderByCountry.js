import { COUNTRY_CODES } from '../../config/countryConfig';
import { PAYMENT_PROVIDERS } from './providers';

/**
 * Proveedor de cobro por defecto según país del negocio (producto).
 * CL / AR → Mercado Pago; resto de ISO soportados → PayPal.
 *
 * @param {string|null|undefined} countryCode
 * @returns {typeof PAYMENT_PROVIDERS[keyof typeof PAYMENT_PROVIDERS]}
 */
export function getDefaultBillingProviderForCountry(countryCode) {
  const c = String(countryCode || '').trim().toUpperCase();
  if (!c || !COUNTRY_CODES.includes(c)) return PAYMENT_PROVIDERS.PAYPAL;
  if (c === 'CL' || c === 'AR') return PAYMENT_PROVIDERS.MERCADO_PAGO;
  return PAYMENT_PROVIDERS.PAYPAL;
}

/** Alias explícito para reglas de producto (planes, checkout, fallbacks). */
export const resolveBillingProvider = getDefaultBillingProviderForCountry;
