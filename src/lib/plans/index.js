/**
 * src/lib/plans/index.js — Única fuente de verdad de planes para Ventalink.
 *
 * Capa de compatibilidad sobre src/config/planFeatures.js y
 * src/services/waBusinessService.js. No elimina código existente;
 * toda validación FUTURA debe importar desde aquí.
 *
 * Exports principales:
 *   PLANS             — definición de los planes disponibles
 *   PLAN_LIMITS       — límites numéricos por plan
 *   VALID_PLAN_SLUGS  — slugs reconocidos
 *   VALID_PLAN_STATES — estados de billing válidos
 *   hasFeature()      — ¿el plan incluye la feature?
 *   getPlanLimits()   — límites del plan activo
 *   isPlanActive()    — ¿el plan es efectivamente activo ahora?
 *   getEffectivePlan()— plan efectivo dado business/subscription
 */

// ── Re-exports del módulo canónico de features ───────────────────────────────
export {
  PLAN_FEATURES,
  FEATURE_MIN_PLAN,
  hasPlanFeature,
  canUseFeature,
  getFeature,
  getFeaturesByPlan,
  getLockedFeatures,
  hasPlanFeatureWithOverride,
} from '../../config/planFeatures';

import { hasPlanFeature as _hasPlanFeature } from '../../config/planFeatures';

// ── Planes ───────────────────────────────────────────────────────────────────

/** Slugs válidos. 'full' es alias legacy de 'business'. */
export const VALID_PLAN_SLUGS = Object.freeze(['starter', 'pro', 'business']);

/** Alias legacy → slug canónico. */
export const PLAN_SLUG_ALIASES = Object.freeze({ full: 'business' });

/** Metadata de planes para UI de precios / comparaciones. */
export const PLANS = Object.freeze({
  starter: {
    slug: 'starter',
    label: 'Starter',
    labelEs: 'Gratis',
    color: 'gray',
    order: 0,
  },
  pro: {
    slug: 'pro',
    label: 'Pro',
    labelEs: 'Pro',
    color: 'blue',
    order: 1,
  },
  business: {
    slug: 'business',
    label: 'Business',
    labelEs: 'Business',
    color: 'purple',
    order: 2,
  },
});

// ── Límites numéricos ─────────────────────────────────────────────────────────

/**
 * Límites cuantitativos por plan.
 * null = sin límite (ilimitado).
 * Fuente única: cambiar aquí se propaga a todo el frontend.
 *
 * Los valores aquí DEBEN coincidir con las funciones SQL:
 *   wa_plan_max_products()          → migrations/20260619140000
 *   wa_plan_max_orders_per_month()  → migrations/20260619170000
 */
export const PLAN_LIMITS = Object.freeze({
  starter: {
    products: 20,
    ordersPerMonth: 50,
    users: 1,
    customDomains: 0,
  },
  pro: {
    products: 100,
    ordersPerMonth: null,
    users: 3,
    customDomains: 1,
  },
  business: {
    products: null,
    ordersPerMonth: null,
    users: null,
    customDomains: 5,
  },
});

// ── Estados de billing válidos ────────────────────────────────────────────────

export const VALID_PLAN_STATES = Object.freeze([
  'active',
  'trial',
  'trial_with_subscription',
  'trial_without_subscription',
  'past_due',
  'canceled',
  'paused',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normaliza un slug raw a uno de los slugs canónicos.
 * 'full' → 'business'; cualquier desconocido → 'starter'.
 *
 * @param {string|null|undefined} rawSlug
 * @returns {'starter'|'pro'|'business'}
 */
export function normalizePlanSlug(rawSlug) {
  const s = (rawSlug || '').toString().trim().toLowerCase();
  if (PLAN_SLUG_ALIASES[s]) return PLAN_SLUG_ALIASES[s];
  if (VALID_PLAN_SLUGS.includes(s)) return s;
  return 'starter';
}

/**
 * Alias semántico de hasPlanFeature para importación uniforme.
 * Preferir este helper en código nuevo.
 *
 * @param {string} planSlug
 * @param {string} featureId
 * @returns {boolean}
 */
export function hasFeature(planSlug, featureId) {
  return _hasPlanFeature(normalizePlanSlug(planSlug), featureId);
}

/**
 * Límites numéricos del plan.
 *
 * @param {string} planSlug
 * @returns {{ products: number|null, ordersPerMonth: number|null, users: number|null, customDomains: number|null }}
 */
export function getPlanLimits(planSlug) {
  const slug = normalizePlanSlug(planSlug);
  return PLAN_LIMITS[slug] ?? PLAN_LIMITS.starter;
}

/**
 * ¿El plan está activo en este momento?
 * Replica la lógica de getEffectivePlanSlug() pero retorna boolean.
 *
 * Reglas (en orden):
 *   1. plan_expires_at en el futuro → activo (plan de pago vigente)
 *   2. trial_expires_at en el futuro → activo (trial vigente)
 *   3. Ambos null → activo (plan admin sin vencimiento configurado)
 *   4. Cualquier otro caso → NO activo (downgrade a starter)
 *
 * @param {string} planSlug
 * @param {string|null} planExpiresAt   — ISO timestamp o null
 * @param {string|null} [trialExpiresAt] — ISO timestamp o null
 * @returns {boolean}
 */
export function isPlanActive(planSlug, planExpiresAt, trialExpiresAt = null) {
  const slug = normalizePlanSlug(planSlug);
  // Starter siempre activo — no tiene vencimiento.
  if (slug === 'starter') return true;

  const now = Date.now();

  if (planExpiresAt) {
    const exp = new Date(planExpiresAt).getTime();
    if (Number.isFinite(exp) && exp > now) return true;
  }

  if (trialExpiresAt) {
    const trialExp = new Date(trialExpiresAt).getTime();
    if (Number.isFinite(trialExp) && trialExp > now) return true;
  }

  // Sin vencimientos configurados → admin legacy, válido
  if (!planExpiresAt && !trialExpiresAt) return true;

  return false;
}

/**
 * Plan efectivo: resuelve qué plan usa realmente el negocio en este momento.
 *
 * Acepta dos formas de llamada:
 *
 * A) Con objeto business (camelCase):
 *    getEffectivePlan({ planSlug, planExpiresAt, trialExpiresAt })
 *
 * B) Con objeto subscription (snake_case):
 *    getEffectivePlan({ plan_slug, current_period_ends_at, trial_ends_at })
 *
 * @param {object} source — business o subscription object
 * @returns {'starter'|'pro'|'business'}
 */
export function getEffectivePlan(source = {}) {
  // Soporta tanto camelCase (business) como snake_case (subscription).
  const rawSlug =
    source?.planSlug ??
    source?.plan_slug ??
    'starter';

  const planExpiresAt =
    source?.planExpiresAt ??
    source?.plan_expires_at ??
    source?.current_period_ends_at ??
    null;

  const trialExpiresAt =
    source?.trialExpiresAt ??
    source?.trial_expires_at ??
    source?.trial_ends_at ??
    null;

  const slug = normalizePlanSlug(rawSlug);

  if (!isPlanActive(slug, planExpiresAt, trialExpiresAt)) {
    return 'starter';
  }

  return slug;
}

/**
 * ¿El plan A es igual o superior al plan B?
 * Útil para gates de "requiere Pro o superior".
 *
 * @param {string} planSlug   — plan actual del usuario
 * @param {string} minRequired — plan mínimo requerido
 * @returns {boolean}
 */
export function isPlanAtLeast(planSlug, minRequired) {
  const order = { starter: 0, pro: 1, business: 2 };
  return (order[normalizePlanSlug(planSlug)] ?? 0) >= (order[normalizePlanSlug(minRequired)] ?? 0);
}
