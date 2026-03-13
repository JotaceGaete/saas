/**
 * Planes del producto: nombres, límites numéricos y helpers.
 * starter = gratis, control = prueba MP, pro = intermedio, business = superior.
 */

export const PLAN_SLUGS = Object.freeze(['starter', 'control', 'pro', 'business']);

export const PLAN_LABELS = Object.freeze({
  starter:  'Starter',
  control:  'Plan Control',
  pro:      'Pro',
  business: 'Business',
});

export const PLAN_COLORS = Object.freeze({
  starter:  { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  control:  { color: '#6366F1', bg: 'rgba(99,102,241,0.1)' },
  pro:      { color: '#7C3AED', bg: 'rgba(124,58,237,0.1)' },
  business: { color: '#059669', bg: 'rgba(16,185,129,0.1)' },
});

/** Orden para saber upgrade (subir) vs downgrade (bajar). */
export const PLAN_ORDER = Object.freeze({
  starter:  0,
  control:  1,
  pro:      2,
  business: 3,
});

/** Precios en CLP (Chile). starter = gratis. control = 500 (solo pruebas MP). */
export const PLAN_PRICES_CLP = Object.freeze({
  starter:  0,
  control:  500,
  pro:      5000,
  business: 10000,
});

/** Precios en ARS (Argentina). Ajustar según tu estrategia de precios. */
export const PLAN_PRICES_ARS = Object.freeze({
  starter:  0,
  control:  500,
  pro:      15000,
  business: 30000,
});

/**
 * Límites por plan. null = ilimitado.
 * maxBusinesses = cuántos negocios puede tener el usuario (por ahora 1 para todos).
 */
export const PLAN_LIMITS = Object.freeze({
  starter: {
    maxProducts:       10,
    maxOrdersPerMonth: 30,
    maxBusinesses:     1,
  },
  control: {
    maxProducts:       10,
    maxOrdersPerMonth: 30,
    maxBusinesses:     1,
  },
  pro: {
    maxProducts:       50,
    maxOrdersPerMonth: null,
    maxBusinesses:     1,
  },
  business: {
    maxProducts:       null,
    maxOrdersPerMonth: null,
    maxBusinesses:     1,
  },
});

/** Porcentaje de uso a partir del cual mostrar aviso (80%). */
export const PLAN_WARN_THRESHOLD = 0.80;

/**
 * @param {string} planSlug
 * @returns {{ maxProducts: number|null, maxOrdersPerMonth: number|null, maxBusinesses: number }}
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
 * @param {string} planSlug
 * @returns {{ color: string, bg: string }}
 */
export function getPlanColors(planSlug) {
  return PLAN_COLORS[planSlug] ?? PLAN_COLORS.starter;
}

/**
 * Precio del plan en CLP. 0 = gratis.
 * @param {string} planSlug
 * @returns {number}
 */
export function getPlanPrice(planSlug) {
  return PLAN_PRICES_CLP[planSlug] ?? 0;
}

/**
 * Precio del plan según país (CLP o ARS).
 * @param {string} planSlug
 * @param {'AR'|'CL'} [countryCode] - Si no se pasa, se asume CL (CLP).
 * @returns {number}
 */
export function getPlanPriceByCountry(planSlug, countryCode) {
  if (countryCode === 'AR') return PLAN_PRICES_ARS[planSlug] ?? 0;
  return PLAN_PRICES_CLP[planSlug] ?? 0;
}

/**
 * Tipo de cambio: 'upgrade' | 'downgrade' | 'renewal'.
 */
export function getPlanChangeType(currentSlug, targetSlug) {
  const current = PLAN_ORDER[currentSlug] ?? 0;
  const target  = PLAN_ORDER[targetSlug]  ?? 0;
  if (target > current) return 'upgrade';
  if (target < current) return 'downgrade';
  return 'renewal';
}

/**
 * Texto del botón de acción para cambiar de plan.
 */
export function getPlanActionButtonLabel(currentSlug, targetSlug) {
  const type  = getPlanChangeType(currentSlug, targetSlug);
  const label = getPlanLabel(targetSlug);
  if (type === 'upgrade')   return `Subir a ${label}`;
  if (type === 'downgrade') return `Cambiar a ${label}`;
  return 'Renovar plan';
}

/**
 * Calcula el porcentaje de uso y si está en zona de alerta.
 * @param {number} used  - cantidad usada
 * @param {number|null} max  - límite (null = ilimitado)
 * @returns {{ pct: number, warn: boolean, exceeded: boolean }}
 */
export function getUsageStatus(used, max) {
  if (max === null || max === undefined) return { pct: 0, warn: false, exceeded: false };
  const pct = max > 0 ? Math.min(used / max, 1) : 1;
  return {
    pct,
    warn:     pct >= PLAN_WARN_THRESHOLD,
    exceeded: used >= max,
  };
}

/**
 * Plan de "siguiente upgrade" recomendado dado el plan actual.
 * @param {string} currentSlug
 * @returns {string|null}
 */
export function getUpgradePlan(currentSlug) {
  const order = PLAN_ORDER[currentSlug] ?? 0;
  return PLAN_SLUGS.find(s => (PLAN_ORDER[s] ?? 0) === order + 1) ?? null;
}
