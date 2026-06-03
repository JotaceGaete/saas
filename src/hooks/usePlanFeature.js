import { useMemo } from 'react';
import { useAuth } from 'contexts/AuthContext';
import { getEffectivePlanSlug } from 'services/waBusinessService';
import { hasPlanFeature, FEATURE_MIN_PLAN } from 'config/planFeatures';
import { CRM_EARLY_ACCESS_MODE } from 'config/crmConfig';

/**
 * Devuelve si el negocio activo tiene acceso a una feature específica.
 *
 * @param {string} feature  - clave de PLAN_FEATURES (e.g. 'invoices', 'barcodePrinting')
 * @returns {boolean}
 *
 * @example
 *   const canUseInvoices = usePlanFeature('invoices');
 *   if (!canUseInvoices) { navigate('/planes'); return; }
 */
export function usePlanFeature(feature) {
  const { business } = useAuth();

  return useMemo(() => {
    // Early-access override for CRM features (while in beta)
    if (CRM_EARLY_ACCESS_MODE) return true;

    const effectivePlan = getEffectivePlanSlug(
      business?.planSlug,
      business?.planExpiresAt,
      business?.trialExpiresAt
    );
    return hasPlanFeature(effectivePlan, feature);
  }, [business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt, feature]);
}

/**
 * Devuelve el plan efectivo actual del negocio.
 * @returns {'starter' | 'pro' | 'business'}
 */
export function useEffectivePlan() {
  const { business } = useAuth();
  return useMemo(
    () => getEffectivePlanSlug(business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt),
    [business?.planSlug, business?.planExpiresAt, business?.trialExpiresAt]
  );
}

/**
 * Devuelve el plan mínimo requerido para usar una feature.
 * Útil para mostrar en UX ("Disponible desde plan Pro").
 * @param {string} feature
 * @returns {'starter' | 'pro' | 'business'}
 */
export function useFeatureMinPlan(feature) {
  return FEATURE_MIN_PLAN[feature] ?? 'business';
}

export default usePlanFeature;
