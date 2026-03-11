/**
 * Planes del producto: nombres y límites numéricos.
 * starter = gratis, control = prueba MP, pro = intermedio, business = superior.
 */

export const PLAN_SLUGS = Object.freeze(['starter', 'control', 'pro', 'business']);

export const PLAN_LABELS = Object.freeze({
  starter: 'Starter',
  control: 'Plan Control',
  pro: 'Pro',
  business: 'Business',
});

/** Precios en CLP (Chile). starter = gratis. control = 500 (solo pruebas MP). */
export const PLAN_PRICES_CLP = Object.freeze({
  starter: 0,
  control: 500,
  pro: 5000,
  business: 10000,
});

/** Límites por plan. null = ilimitado */
export const PLAN_LIMITS = Object.freeze({
  starter: {
    maxProducts: 10,
    maxOrdersPerMonth: 30,
  },
  control: {
    maxProducts: 10,
    maxOrdersPerMonth: 30,
  },
  pro: {
    maxProducts: 50,
    maxOrdersPerMonth: null,
  },
  business: {
    maxProducts: null,
    maxOrdersPerMonth: null,
  },
});

/**
 * @param {string} planSlug - 'starter' | 'pro' | 'business'
 * @returns {{ maxProducts: number | null, maxOrdersPerMonth: number | null }}
 */
export function getPlanLimits(planSlug) {
  const slug = planSlug && PLAN_SLUGS.includes(planSlug) ? planSlug : 'starter';
  return PLAN_LIMITS[slug] ?? PLAN_LIMITS.starter;
}

/**
 * @param {string} planSlug
 * @returns {string}
 */
export function getPlanLabel(planSlug) {
  return PLAN_LABELS[planSlug] ?? PLAN_LABELS.starter;
}

/**
 * Precio del plan en CLP (Chile). 0 = gratis.
 * @param {string} planSlug
 * @returns {number}
 */
export function getPlanPrice(planSlug) {
  return PLAN_PRICES_CLP[planSlug] ?? 0;
}
