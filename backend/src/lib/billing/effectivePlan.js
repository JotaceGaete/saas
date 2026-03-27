/**
 * Plan efectivo para límites (paridad con src/services/waBusinessService.js getEffectivePlanSlug).
 * Si trial_expires_at > ahora, el negocio conserva las capacidades del plan_slug (p. ej. pro).
 */
export function getEffectivePlanSlug(planSlug, planExpiresAt, trialExpiresAt = null) {
  const slug = planSlug || 'starter';
  if (!['pro', 'business'].includes(slug)) return slug;

  const now = new Date();

  if (planExpiresAt) {
    const exp = new Date(planExpiresAt);
    if (!Number.isNaN(exp.getTime()) && exp > now) return slug;
  }

  if (trialExpiresAt) {
    const trialExp = new Date(trialExpiresAt);
    if (!Number.isNaN(trialExp.getTime()) && trialExp > now) return slug;
  }

  if (!planExpiresAt && !trialExpiresAt) return slug;

  return 'starter';
}

/**
 * @param {string|null|undefined} trialExpiresAt ISO
 * @returns {boolean}
 */
export function isProTrialActive(trialExpiresAt) {
  if (!trialExpiresAt) return false;
  const t = new Date(trialExpiresAt);
  return Number.isFinite(t.getTime()) && t > new Date();
}
