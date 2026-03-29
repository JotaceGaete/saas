import { supabase } from '../supabase';

/** @param {string|null|undefined} raw */
export function normalizePlanSlugForBilling(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (slug === 'full') return 'business';
  if (slug === 'business' || slug === 'pro' || slug === 'starter') return slug;
  return null;
}

function isBillingSubscriptionRowUsable(row) {
  if (!row) return false;
  return !!(
    row.trial_ends_at
    || row.next_billing_date
    || row.current_period_ends_at
    || row.status
    || row.plan_slug
  );
}

/**
 * Fila única de `billing_subscriptions` por negocio (SoT fechas de facturación).
 * @param {string} businessId
 * @returns {Promise<object|null>}
 */
export async function fetchBillingSubscriptionByBusinessId(businessId) {
  const id = String(businessId || '').trim();
  if (!id) return null;
  const { data, error } = await supabase
    .from('billing_subscriptions')
    .select('trial_ends_at, next_billing_date, current_period_ends_at, status, plan_slug, updated_at')
    .eq('business_id', id)
    .maybeSingle();
  if (error) {
    console.warn('[billing_subscriptions] read failed', error.message);
    return null;
  }
  return data || null;
}

/**
 * Paso 1: `billing_subscriptions`. Paso 2: si no hay fila útil, `wa_businesses` (legacy).
 * Marca `_displaySource` para que el UI sepa si las fechas vienen de la tabla moderna o legacy.
 *
 * @param {string} businessId
 * @returns {Promise<object|null>}
 */
export async function fetchBillingSubscriptionWithLegacyFallback(businessId) {
  const id = String(businessId || '').trim();
  if (!id) return null;

  const fromBilling = await fetchBillingSubscriptionByBusinessId(id);
  if (fromBilling && isBillingSubscriptionRowUsable(fromBilling)) {
    return { ...fromBilling, _displaySource: 'billing_subscriptions' };
  }

  const { data: biz, error } = await supabase
    .from('wa_businesses')
    .select('plan_slug, plan_started_at, trial_expires_at, plan_expires_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.warn('[billing_subscriptions] legacy wa_businesses read failed', error.message);
    return fromBilling ? { ...fromBilling, _displaySource: 'billing_subscriptions' } : null;
  }
  if (!biz) {
    return fromBilling ? { ...fromBilling, _displaySource: 'billing_subscriptions' } : null;
  }

  console.info('[billing_subscriptions] display_source=legacy_wa_businesses', { businessId: id });

  return {
    trial_ends_at: biz.trial_expires_at ?? null,
    next_billing_date: biz.plan_expires_at ?? null,
    current_period_ends_at: biz.plan_expires_at ?? null,
    plan_slug: biz.plan_slug ?? null,
    plan_started_at: biz.plan_started_at ?? null,
    status: null,
    updated_at: null,
    _displaySource: 'legacy_wa_businesses',
  };
}
