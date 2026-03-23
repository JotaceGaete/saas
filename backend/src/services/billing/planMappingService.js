import { getPaypalMode } from '../../config/paypal/index.js';
import { getPaypalPlanMapping, getPaypalPlanMappingByPlanId } from '../../repositories/paypalPlanMappingRepository.js';
import { HttpError } from '../../lib/http/HttpError.js';

const INTERNAL_FREE_PLAN_ALIASES = new Set(['free', 'starter', 'control']);
const INTERNAL_PAYWALLED_PLANS = new Set(['pro', 'full', 'business']);

function normalizeInternalPlanSlug(planSlug) {
  const raw = String(planSlug || '').trim().toLowerCase();
  if (!raw) return null;
  if (INTERNAL_FREE_PLAN_ALIASES.has(raw)) return 'free';
  if (raw === 'pro') return 'pro';
  if (raw === 'full' || raw === 'business') return 'full';
  return null;
}

/**
 * Mapea plan interno a paypal_plan_id (por entorno actual).
 * free|starter|control => null (sin PayPal)
 * pro => planId pro
 * full|business => planId full
 */
export async function getPaypalPlanIdForInternalPlan(planSlug) {
  const normalized = normalizeInternalPlanSlug(planSlug);
  if (!normalized) {
    throw new HttpError(400, `[plan-mapping] Unsupported internal plan slug: ${planSlug}`);
  }
  if (normalized === 'free') {
    throw new HttpError(400, '[plan-mapping] free plan does not use paypal_plan_id');
  }

  const environment = getPaypalMode();
  const mapping = await getPaypalPlanMapping({
    environment,
    planSlug: normalized,
  });
  if (!mapping) {
    throw new HttpError(400, `[plan-mapping] Missing mapping for plan=${normalized}, environment=${environment}`);
  }
  const paypalPlanId = String(mapping?.paypal_plan_id || '').trim();
  if (!paypalPlanId) {
    throw new HttpError(400, `[plan-mapping] paypal_plan_id is null for plan=${normalized}, environment=${environment}`);
  }

  return paypalPlanId;
}

/**
 * Mapea paypal_plan_id a plan interno.
 * Retorna: pro | full | null
 */
export async function getInternalPlanFromPaypalPlanId(paypalPlanId) {
  const id = String(paypalPlanId || '').trim();
  if (!id) return null;
  const environment = getPaypalMode();
  const mapping = await getPaypalPlanMappingByPlanId({
    environment,
    paypalPlanId: id,
  });
  if (!mapping?.plan_slug) return null;
  const slug = String(mapping.plan_slug).trim().toLowerCase();
  if (slug === 'business') return 'full';
  if (slug === 'pro' || slug === 'full') return slug;
  if (slug === 'starter' || slug === 'free' || slug === 'control') return 'free';
  return null;
}

/**
 * Valida si un slug interno corresponde a plan de pago.
 */
export function isPaidInternalPlan(planSlug) {
  const raw = String(planSlug || '').trim().toLowerCase();
  return INTERNAL_PAYWALLED_PLANS.has(raw);
}

export function normalizePlanSlugForBilling(planSlug) {
  return normalizeInternalPlanSlug(planSlug);
}

