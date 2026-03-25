/**
 * Meta de mercado y moneda de UI de planes alineada con la app (countryPricing / market-config).
 * Duplicación mínima frente a frontend: solo marketStatus por país y moneda de display de planes.
 */

import { getPaymentOptions } from './providerSelectionService.js';

export const BILLING_MARKET_STATUS = Object.freeze({
  ACTIVE: 'active',
  BETA: 'beta',
  COMING_SOON: 'coming_soon',
  UNSUPPORTED: 'unsupported',
});

const COUNTRY_MARKET_STATUS = Object.freeze({
  BO: BILLING_MARKET_STATUS.BETA,
  PE: BILLING_MARKET_STATUS.BETA,
});

function normalizeCountryCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return code || null;
}

export function getMarketStatusForBillingCountry(countryCode) {
  const c = normalizeCountryCode(countryCode) || 'US';
  return COUNTRY_MARKET_STATUS[c] || BILLING_MARKET_STATUS.ACTIVE;
}

export function getAutomaticCheckoutPolicyByMarketStatus(marketStatus) {
  const status = String(marketStatus || '').trim().toLowerCase();
  if (status === BILLING_MARKET_STATUS.COMING_SOON || status === BILLING_MARKET_STATUS.UNSUPPORTED) {
    return {
      allowed: false,
      message: 'Este método de pago estará disponible próximamente para tu mercado.',
    };
  }
  return { allowed: true, message: null };
}

/** Misma regla que frontend countryPricing: solo CL/AR en moneda local en UI de planes; resto USD referencia. */
export function getPlanDisplayCurrencyForBilling(countryCode, businessCurrency) {
  const c = normalizeCountryCode(countryCode) || 'US';
  if (c === 'CL' || c === 'AR') {
    return String(businessCurrency || 'USD').trim().toUpperCase() || 'USD';
  }
  return 'USD';
}

export function getPrimaryProviderCandidateForCountry(countryCode) {
  return getPaymentOptions({ countryCode }).primary;
}
