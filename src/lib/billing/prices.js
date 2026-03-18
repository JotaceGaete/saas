/**
 * Precios de planes para mostrar en UI. Una sola fuente de verdad.
 * Lee de constants (PLAN_PRICES_BY_REGION).
 */

import { PLAN_PRICES_BY_REGION, BILLING_REGION_CL, BILLING_REGION_INT } from './constants';
import { getBillingRegion } from './region';

/**
 * Precio a mostrar para un plan en una región.
 * @param {string} planSlug - starter | pro | business
 * @param {'CL'|'INT'} [region] - Si no se pasa, no se puede resolver (requiere región explícita en llamadas desde UI).
 * @returns {number}
 */
export function getPlanDisplayPrice(planSlug, region) {
  const r = region === BILLING_REGION_CL ? BILLING_REGION_CL : BILLING_REGION_INT;
  const prices = PLAN_PRICES_BY_REGION[r];
  return prices?.[planSlug] ?? 0;
}

/**
 * Precio a mostrar para un plan según country code (resuelve región internamente).
 * @param {string} planSlug
 * @param {string} [countryCode]
 * @returns {number}
 */
export function getPlanDisplayPriceByCountry(planSlug, countryCode) {
  const region = getBillingRegion(countryCode);
  return getPlanDisplayPrice(planSlug, region);
}
