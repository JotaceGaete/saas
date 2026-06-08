import { getPlanPriceForCountry } from '../config/countryPricing';

/**
 * Planes del producto: nombres, límites numéricos y helpers.
 * starter = gratis (20 productos, 50 pedidos/mes; sin estadísticas ni IA).
 * pro     = pago o trial (100 productos, pedidos ilimitados, estadísticas, IA).
 * business = Full (productos y pedidos ilimitados, estadísticas completas, IA ilimitada).
 */

/** Duración del período de prueba PRO para nuevos usuarios (debe coincidir con wa_handle_new_user_business). */
export const TRIAL_DURATION_DAYS = 14;

export const PLAN_SLUGS = Object.freeze(['starter', 'pro', 'business']);

export const PLAN_LABELS = Object.freeze({
  starter:  'Starter',
  pro:      'Pro',
  business: 'Full',
});

export const PLAN_COLORS = Object.freeze({
  starter:  { color: '#6B7280', bg: 'rgba(107,114,128,0.1)' },
  pro:      { color: '#7C3AED', bg: 'rgba(124,58,237,0.1)' },
  business: { color: '#059669', bg: 'rgba(16,185,129,0.1)' },
});

/** Orden para saber upgrade (subir) vs downgrade (bajar). */
export const PLAN_ORDER = Object.freeze({
  starter:  0,
  pro:      1,
  business: 2,
});

/** Precios en CLP (Chile) / mes. starter = gratis. */
export const PLAN_PRICES_CLP = Object.freeze({
  starter:  0,
  pro:      5990,
  business: 9990,
});

/** Precios en ARS (Argentina). */
export const PLAN_PRICES_ARS = Object.freeze({
  starter:  0,
  pro:      8990,
  business: 13990,
});

/** Precios en USD (referencia internacional, fuera de Chile). Pro=6 USD, Full=10 USD. */
export const PLAN_PRICES_USD = Object.freeze({
  starter:  0,
  pro:      6,
  business: 10,
});

/**
 * Límites por plan. null = ilimitado.
 * maxBusinesses = cuántos negocios puede tener el usuario (por ahora 1 para todos).
 */
export const PLAN_LIMITS = Object.freeze({
  starter: {
    maxProducts:       20,
    maxOrdersPerMonth: 50,
    maxBusinesses:     1,
    maxSuppliers:      5,
  },
  pro: {
    maxProducts:       100,
    maxOrdersPerMonth: null,
    maxBusinesses:     1,
    maxSuppliers:      null,
  },
  business: {
    maxProducts:       null,
    maxOrdersPerMonth: null,
    maxBusinesses:     1,
    maxSuppliers:      null,
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
 * Precio del plan según país ISO del negocio (delega en countryPricing).
 * @param {string} planSlug
 * @param {string} [countryCode]
 * @param {'mercado_pago'|'manual'|null} [_paymentProvider] ignorado; compatibilidad API
 * @returns {number}
 */
export function getPlanPriceByCountry(planSlug, countryCode, _paymentProvider) {
  return getPlanPriceForCountry(countryCode, planSlug);
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
