/**
 * Precios de planes para UI: delegan en countryPricing (país ISO).
 * `getPlanDisplayPrice(region)` conserva compatibilidad: CL vs resto → país proxy.
 */

import { PLAN_PRICES_BY_REGION, BILLING_REGION_CL, BILLING_REGION_INT } from './constants';
import { getPlanPriceForCountry } from '../../config/countryPricing';

/**
 * @param {string} planSlug
 * @param {'CL'|'INT'} [region]
 * @returns {number}
 */
export function getPlanDisplayPrice(planSlug, region) {
  const r = region === BILLING_REGION_CL ? BILLING_REGION_CL : BILLING_REGION_INT;
  const prices = PLAN_PRICES_BY_REGION[r];
  return prices?.[planSlug] ?? 0;
}

/**
 * @param {string} planSlug
 * @param {string} [countryCode] - ISO del negocio o visitante
 * @returns {number}
 */
export function getPlanDisplayPriceByCountry(planSlug, countryCode) {
  return getPlanPriceForCountry(countryCode, planSlug);
}
