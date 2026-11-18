/**
 * Dominios personalizados: se conserva el comportamiento actual de Walinka (decisión del dueño).
 * Límites por plan espejados de src/lib/plans/index.js (customDomains). Si cambian allá, cambian aquí.
 * Pendiente técnico: unificar en una sola fuente (hoy plans.js y src/constants/plans.js están duplicados).
 */
export const CUSTOM_DOMAIN_LIMITS = Object.freeze({ starter: 0, pro: 1, business: 5 });

export function customDomainLimit(planSlug) {
  const key = String(planSlug ?? '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CUSTOM_DOMAIN_LIMITS, key) ? CUSTOM_DOMAIN_LIMITS[key] : 0;
}

export function canUseCustomDomain(planSlug) {
  return customDomainLimit(planSlug) > 0;
}

/** Comprueba si un nuevo dominio cabe en el límite del plan. `currentCount` = dominios ya registrados. */
export function assertCustomDomainAllowed(planSlug, currentCount = 0) {
  const limit = customDomainLimit(planSlug);
  if (limit === 0) return { allowed: false, code: 'PLAN_NO_CUSTOM_DOMAIN', limit };
  if (currentCount >= limit) return { allowed: false, code: 'DOMAIN_LIMIT_REACHED', limit };
  return { allowed: true, limit };
}
