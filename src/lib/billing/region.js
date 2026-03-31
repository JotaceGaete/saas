/**
 * Resolución de región y proveedor de pago.
 * Regla única: country_code === 'CL' → región CL, Mercado Pago; resto → INT, PayPal.
 */

import {
  BILLING_REGION_CL,
  BILLING_REGION_INT,
  CURRENCY_BY_REGION,
  PROVIDER_BY_REGION,
} from './constants';
import { getBillingCurrencyForCountry } from '../../config/countryPricing';

/**
 * Convierte country_code a región de billing.
 * @param {string} [countryCode] - Código ISO (CL, AR, ...)
 * @returns {'CL'|'INT'}
 */
export function getBillingRegion(countryCode) {
  if (!countryCode || typeof countryCode !== 'string') return BILLING_REGION_INT;
  const code = countryCode.toUpperCase().trim();
  return (code === 'CL' || code === 'AR') ? BILLING_REGION_CL : BILLING_REGION_INT;
}

/**
 * @param {string} [countryCode]
 * @returns {boolean}
 */
export function isChile(countryCode) {
  return getBillingRegion(countryCode) === BILLING_REGION_CL;
}

/**
 * Proveedor de pago para la región.
 * @param {string} [countryCode]
 * @returns {'mercado_pago'|'paypal'}
 */
export function getPaymentProvider(countryCode) {
  const region = getBillingRegion(countryCode);
  return PROVIDER_BY_REGION[region] ?? 'paypal';
}

/**
 * Moneda de facturación/display según país ISO (alineada con countryPricing).
 * @param {string} [countryCode]
 * @returns {string}
 */
export function getCurrency(countryCode) {
  return getBillingCurrencyForCountry(countryCode);
}
