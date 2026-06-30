/**
 * CRM_EARLY_ACCESS_MODE = true  → plan gating disabled; admins have full CRM access,
 *                                  normal users are already blocked by sidebar adminOnly.
 * CRM_EARLY_ACCESS_MODE = false → re-enables plan checks (requires 'business' plan).
 */
export const CRM_EARLY_ACCESS_MODE = false;

export const CRM_ADMIN_ONLY = false;

/**
 * Determina si un usuario puede acceder al CRM.
 * Punto único de decisión — no dispersar la condición isAdmin en múltiples archivos.
 *
 * @param {boolean} isAdmin       - viene de useAuth().isAdmin
 * @param {boolean} hasPlanAccess - viene de usePlanFeature('crmAccess')
 * @returns {boolean}
 */
export function canAccessCrm(isAdmin, hasPlanAccess) {
  if (CRM_ADMIN_ONLY) return isAdmin;
  return isAdmin || hasPlanAccess;
}
