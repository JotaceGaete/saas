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
 * Fallback cuando no hay fila en `paypal_plan_mappings` (p. ej. producción sin migración aún).
 * Prioridad: PAYPAL_PLAN_ID_{PRO|FULL}_{LIVE|SANDBOX}, luego PAYPAL_PLAN_ID_{PRO|FULL}.
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
 * Indica si el catálogo PayPal (pro + full) está cubierto para el entorno actual.
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
  const paypalPlanId = await resolvePaypalPlanIdOrNull(planSlug);
  if (!paypalPlanId) {
    const hint =
      'Añade filas en la tabla `paypal_plan_mappings` para este entorno, o define variables de entorno: '
      + `PAYPAL_PLAN_ID_PRO_${environment === 'live' ? 'LIVE' : 'SANDBOX'} y `
      + `PAYPAL_PLAN_ID_FULL_${environment === 'live' ? 'LIVE' : 'SANDBOX'} (valores = Plan ID de PayPal Billing).`;
    throw new HttpError(
      503,
      `[plan-mapping] Falta el Plan ID de PayPal para plan "${normalized}" en entorno "${environment}". Configura la tabla paypal_plan_mappings o las variables PAYPAL_PLAN_ID_* en el servidor.`,
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
 * Si no hay fila en DB, compara el Plan ID con PAYPAL_PLAN_ID_* del mismo entorno (mismo criterio que resolvePaypalPlanIdOrNull).
 * Solo afecta resolución inversa PayPal → interno; Mercado Pago no usa este archivo para cobros.
 */
function getInternalPlanFromEnvPaypalPlanId(paypalPlanId) {
  const id = String(paypalPlanId || '').trim();
  if (!id) return null;
  const environment = getPaypalMode();
  const suffix = environment === 'live' ? 'LIVE' : 'SANDBOX';
  const pairs = [
    [String(process.env[`PAYPAL_PLAN_ID_PRO_${suffix}`] || '').trim(), 'pro'],
    [String(process.env.PAYPAL_PLAN_ID_PRO || '').trim(), 'pro'],
    [String(process.env[`PAYPAL_PLAN_ID_FULL_${suffix}`] || '').trim(), 'full'],
    [String(process.env.PAYPAL_PLAN_ID_FULL || '').trim(), 'full'],
  ];
  for (const [envId, slug] of pairs) {
    if (envId && envId === id) return slug;
  }
  return null;
}

/**
 * Mapea paypal_plan_id a plan interno.
 * Retorna: pro | full | free | null
 * Orden: tabla `paypal_plan_mappings` → variables de entorno PAYPAL_PLAN_ID_* (mismo entorno que getPaypalMode).
 */
export async function getInternalPlanFromPaypalPlanId(paypalPlanId) {
  const id = String(paypalPlanId || '').trim();
  if (!id) return null;
  const environment = getPaypalMode();
  const mapping = await getPaypalPlanMappingByPlanId({
    environment,
    paypalPlanId: id,
  });
  if (mapping?.plan_slug) {
    const slug = String(mapping.plan_slug).trim().toLowerCase();
    if (slug === 'business') return 'full';
    if (slug === 'pro' || slug === 'full') return slug;
    if (slug === 'starter' || slug === 'free' || slug === 'control') return 'free';
    return null;
  }
  return getInternalPlanFromEnvPaypalPlanId(id);
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
