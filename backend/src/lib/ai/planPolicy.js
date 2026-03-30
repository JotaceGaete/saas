/**
 * Política por plan para features de IA (configurable por env; sin hardcodear 403 en el controlador).
 *
 * Plan efectivo: mismo criterio que getEffectivePlanSlug → 'starter' | 'pro' | 'business'.
 * Trial activo con plan_slug pro → effectivePlan 'pro' (acceso “trial/pro”).
 */

/** @type {readonly string[]} */
const DEFAULT_ALLOWED_PLANS_GENERATE_PRODUCT_DESCRIPTION = Object.freeze(['pro', 'business']);

/**
 * Lista de planes permitidos para `generate-product-description`.
 * Env: AI_FEATURE_GENERATE_PRODUCT_DESCRIPTION_ALLOWED_PLANS=starter,pro,business
 * (coma, sin espacios o con espacios recortados; vacío = usar default anterior).
 *
 * @returns {Set<string>}
 */
function getAllowedPlansGenerateProductDescription() {
  const raw = String(
    process.env.AI_FEATURE_GENERATE_PRODUCT_DESCRIPTION_ALLOWED_PLANS ?? '',
  ).trim();
  if (!raw) {
    return new Set(DEFAULT_ALLOWED_PLANS_GENERATE_PRODUCT_DESCRIPTION);
  }
  const parts = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const allowed = new Set();
  for (const p of parts) {
    if (p === 'starter' || p === 'pro' || p === 'business') allowed.add(p);
  }
  return allowed.size > 0 ? allowed : new Set(DEFAULT_ALLOWED_PLANS_GENERATE_PRODUCT_DESCRIPTION);
}

/**
 * @param {'starter'|'pro'|'business'} effectivePlanSlug
 * @returns {{ allowed: boolean, allowedPlans: string[] }}
 */
export function assertGenerateProductDescriptionPlanPolicy(effectivePlanSlug) {
  const slug = String(effectivePlanSlug || 'starter').toLowerCase();
  const allowedSet = getAllowedPlansGenerateProductDescription();
  const allowedPlans = [...allowedSet].sort();
  const allowed = allowedSet.has(slug);
  return { allowed, allowedPlans };
}
