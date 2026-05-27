import { getPaypalMode } from '../../config/paypal/index.js';
import { getPaypalPlanMapping, getPaypalPlanMappingByPlanId } from '../../repositories/paypalPlanMappingRepository.js';
import { HttpError } from '../../lib/http/HttpError.js';

const INTERNAL_FREE_PLAN_ALIASES = new Set(['free', 'starter', 'control']);
const INTERNAL_PAYWALLED_PLANS = new Set(['pro', 'full', 'business', 'pro_annual', 'full_annual']);

function normalizeInternalPlanSlug(planSlug) {
  const raw = String(planSlug || '').trim().toLowerCase();
  if (!raw) return null;
  if (INTERNAL_FREE_PLAN_ALIASES.has(raw)) return 'free';
  if (raw === 'pro') return 'pro';
  if (raw === 'full' || raw === 'business') return 'full';
  if (raw === 'pro_annual') return 'pro_annual';
  if (raw === 'full_annual' || raw === 'business_annual') return 'full_annual';
  return null;
}

/**
 * Fallback cuando no hay fila en `paypal_plan_mappings` (p. ej. producción sin migración aún).
 * Prioridad: PAYPAL_PLAN_ID_{PRO|FULL}_{LIVE|SANDBOX}, luego PAYPAL_PLAN_ID_{PRO|FULL}.
 * Para planes anuales: PAYPAL_PLAN_ID_{PRO|FULL}_ANNUAL_{LIVE|SANDBOX}.
 */
function getEnvFallbackPaypalPlanId(normalizedSlug, environment) {
  const env = String(environment || '').trim().toLowerCase();
  const suffix = env === 'live' ? 'LIVE' : 'SANDBOX';
  if (normalizedSlug === 'pro') {
    return String(
      process.env[`PAYPAL_PLAN_ID_PRO_${suffix}`] || process.env.PAYPAL_PLAN_ID_PRO || '',
    ).trim();
  }
  if (normalizedSlug === 'full') {
    return String(
      process.env[`PAYPAL_PLAN_ID_FULL_${suffix}`] || process.env.PAYPAL_PLAN_ID_FULL || '',
    ).trim();
  }
  if (normalizedSlug === 'pro_annual') {
    return String(
      process.env[`PAYPAL_PLAN_ID_PRO_ANNUAL_${suffix}`] || process.env.PAYPAL_PLAN_ID_PRO_ANNUAL || '',
    ).trim();
  }
  if (normalizedSlug === 'full_annual') {
    return String(
      process.env[`PAYPAL_PLAN_ID_FULL_ANNUAL_${suffix}`] || process.env.PAYPAL_PLAN_ID_FULL_ANNUAL || '',
    ).trim();
  }
  return '';
}

/**
 * Resuelve `paypal_plan_id` (DB `paypal_plan_mappings` o env).
 */
export async function resolvePaypalPlanIdOrNull(planSlug) {
  const normalized = normalizeInternalPlanSlug(planSlug);
  if (!normalized || normalized === 'free') return null;
  const environment = getPaypalMode();
  const mapping = await getPaypalPlanMapping({
    environment,
    planSlug: normalized,
  });
  const fromDb = mapping?.paypal_plan_id ? String(mapping.paypal_plan_id).trim() : '';
  if (fromDb) return fromDb;
  const fromEnv = getEnvFallbackPaypalPlanId(normalized, environment);
  return fromEnv || null;
}

/**
 * Indica si el catálogo PayPal (pro + full mensual) está cubierto para el entorno actual.
 */
export async function getPaypalPlanCatalogReadiness() {
  const environment = getPaypalMode();
  const required = ['pro', 'full'];
  const missing = [];
  for (const slug of required) {
    const id = await resolvePaypalPlanIdOrNull(slug);
    if (!id) missing.push(slug);
  }
  return {
    environment,
    ready: missing.length === 0,
    missing_plans: missing,
  };
}

/**
 * Mapea plan interno a paypal_plan_id (por entorno actual).
 * free|starter|control => null (sin PayPal)
 * pro => planId pro mensual
 * full|business => planId full mensual
 * pro_annual => planId pro anual (PAYPAL_PLAN_ID_PRO_ANNUAL_*)
 * full_annual => planId full anual (PAYPAL_PLAN_ID_FULL_ANNUAL_*)
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
  const paypalPlanId = await resolvePaypalPlanIdOrNull(planSlug);
  if (!paypalPlanId) {
    const isAnnual = normalized === 'pro_annual' || normalized === 'full_annual';
    const envSuffix = environment === 'live' ? 'LIVE' : 'SANDBOX';
    const hint = isAnnual
      ? `Define PAYPAL_PLAN_ID_PRO_ANNUAL_${envSuffix} y PAYPAL_PLAN_ID_FULL_ANNUAL_${envSuffix} en el servidor (Plan IDs de PayPal con ciclo anual).`
      : `Añade filas en la tabla \`paypal_plan_mappings\` para este entorno, o define PAYPAL_PLAN_ID_PRO_${envSuffix} y PAYPAL_PLAN_ID_FULL_${envSuffix} en el servidor.`;
    throw new HttpError(
      503,
      `[plan-mapping] Falta el Plan ID de PayPal para plan "${normalized}" en entorno "${environment}". ${hint}`,
      {
        code: 'PAYPAL_PLAN_MAPPING_MISSING',
        details: {
          plan: normalized,
          environment,
          planSlug: normalized,
          hint,
        },
      },
    );
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
