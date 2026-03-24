import { supabase } from '../supabase';

function isStrictSubscriptionStateEnabled() {
  const raw = String(import.meta.env?.VITE_BILLING_STRICT_SUBSCRIPTION_STATE || '')
    .trim()
    .toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
}

function normalizePlanSlug(raw) {
  const slug = String(raw || '').trim().toLowerCase();
  if (slug === 'full') return 'business';
  if (slug === 'business' || slug === 'pro' || slug === 'starter') return slug;
  return null;
}

function toIso(value) {
  if (!value) return null;
  const dt = new Date(value);
  return Number.isFinite(dt.getTime()) ? dt.toISOString() : null;
}

function mapSubscriptionRow(row) {
  const planSlug = normalizePlanSlug(
    row?.plans?.slug
    || row?.plan
    || null,
  );

  const priceRows = Array.isArray(row?.plans?.plan_prices)
    ? row.plans.plan_prices
    : [];
  const firstPrice = priceRows[0] || null;

  return {
    source: 'subscriptions',
    id: row?.id || null,
    businessId: row?.business_id || null,
    status: String(row?.status || '').trim().toLowerCase() || null,
    planSlug,
    planName: row?.plans?.name || null,
    planId: row?.plan_id || row?.plans?.id || null,
    currentPeriodEnd: toIso(row?.current_period_end || row?.current_period_ends_at || null),
    trialEnd: toIso(row?.trial_end || row?.trial_ends_at || null),
    amount: Number.isFinite(Number(firstPrice?.amount)) ? Number(firstPrice.amount) : null,
    currency: String(firstPrice?.currency || firstPrice?.currency_code || '').trim().toUpperCase() || null,
    raw: row,
  };
}

async function getSubscriptionFromTable(businessId) {
  const joined = await supabase
    .from('subscriptions')
    .select(`
      id,
      business_id,
      plan_id,
      status,
      current_period_end,
      current_period_ends_at,
      trial_end,
      trial_ends_at,
      updated_at,
      created_at,
      plans:plan_id (
        id,
        slug,
        name,
        plan_prices (
          amount,
          currency
        )
      )
    `)
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!joined.error && joined.data) {
    console.info('[subscription-state] source=subscriptions');
    return mapSubscriptionRow(joined.data);
  }
  if (joined.error) {
    console.warn('[subscription-service] subscriptions+join query failed', {
      businessId,
      message: joined.error.message,
    });
  }

  const plain = await supabase
    .from('subscriptions')
    .select(`
      id,
      business_id,
      plan_id,
      status,
      current_period_end,
      current_period_ends_at,
      trial_end,
      trial_ends_at,
      updated_at,
      created_at
    `)
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!plain.error && plain.data) {
    console.info('[subscription-state] source=subscriptions');
    return mapSubscriptionRow(plain.data);
  }
  if (plain.error) {
    console.warn('[subscription-service] subscriptions query failed', {
      businessId,
      message: plain.error.message,
    });
  }

  const legacy = await supabase
    .from('wa_subscriptions')
    .select(`
      id,
      business_id,
      status,
      plan_slug,
      currency,
      amount,
      current_period_end,
      trial_ends_at,
      updated_at,
      created_at
    `)
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!legacy.error && legacy.data) {
    console.warn('[subscription-state] fallback=wa_subscriptions');
    return {
      source: 'wa_subscriptions',
      id: legacy.data.id || null,
      businessId: legacy.data.business_id || null,
      status: String(legacy.data.status || '').trim().toLowerCase() || null,
      planSlug: normalizePlanSlug(legacy.data.plan_slug) || null,
      planName: null,
      planId: null,
      currentPeriodEnd: toIso(legacy.data.current_period_end || null),
      trialEnd: toIso(legacy.data.trial_ends_at || null),
      amount: Number.isFinite(Number(legacy.data.amount)) ? Number(legacy.data.amount) : null,
      currency: String(legacy.data.currency || '').trim().toUpperCase() || null,
      raw: legacy.data,
    };
  }
  if (legacy.error) {
    console.warn('[subscription-service] wa_subscriptions query failed', {
      businessId,
      message: legacy.error.message,
    });
  }
  return null;
}

async function getValidAccessToken() {
  const { data: { session } } = await supabase.auth.getSession();
  let token = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
  if (token && token.includes('.')) return token;
  try {
    const { data: refreshed } = await supabase.auth.refreshSession();
    token = typeof refreshed?.session?.access_token === 'string'
      ? refreshed.session.access_token.trim()
      : '';
  } catch {
    token = '';
  }
  return token && token.includes('.') ? token : null;
}

function mapSubscriptionStateToCurrentSubscriptionShape(state, businessId) {
  if (!state || state.ok !== true) return null;
  const mappedStatus = String(state.billing_status || '').trim().toLowerCase() || null;
  const mappedPlanSlug = normalizePlanSlug(state.plan_slug) || null;
  return {
    source: 'subscription_state',
    id: null,
    businessId,
    status: mappedStatus,
    planSlug: mappedPlanSlug,
    planName: null,
    planId: null,
    currentPeriodEnd: toIso(state.current_period_ends_at || null),
    trialEnd: toIso(state.trial_ends_at || null),
    amount: null,
    currency: null,
    raw: state,
  };
}

async function getSubscriptionStateFromBackend(businessId) {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    console.info('[billing-ui] endpoint=subscription-state');
    const query = new URLSearchParams({ businessId });
    const res = await fetch(`/api/v1/billing/subscription-state?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      console.warn('[subscription-service] backend subscription-state failed', {
        status: res.status,
        code: data?.code || null,
        error: data?.error || null,
      });
      return null;
    }
    const adapted = mapSubscriptionStateToCurrentSubscriptionShape(data, businessId);
    if (adapted) {
      console.info('[billing-ui] adapted subscription state shape', {
        planSlug: adapted.planSlug,
        status: adapted.status,
      });
    }
    return adapted;
  } catch (err) {
    console.warn('[subscription-service] backend subscription-state request error', {
      message: err?.message || 'unknown_error',
    });
    return null;
  }
}

async function getCurrentSubscriptionLegacyFromBackend(businessId) {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
    console.info('[billing-ui] endpoint=current-subscription (legacy)');
    const query = new URLSearchParams({ businessId });
    const res = await fetch(`/api/v1/billing/current-subscription?${query.toString()}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      console.warn('[subscription-service] backend current-subscription failed', {
        status: res.status,
        code: data?.code || null,
        error: data?.error || null,
      });
      return null;
    }
    return data?.subscription || null;
  } catch (err) {
    console.warn('[subscription-service] backend current-subscription request error', {
      message: err?.message || 'unknown_error',
    });
    return null;
  }
}

async function getFallbackFromBusiness(businessId) {
  const { data, error } = await supabase
    .from('wa_businesses')
    .select('id, plan_slug, plan_expires_at, trial_expires_at, currency')
    .eq('id', businessId)
    .maybeSingle();

  if (error) {
    console.warn('[subscription-service] wa_businesses fallback failed', {
      businessId,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;

  return {
    source: 'wa_businesses',
    id: null,
    businessId: data.id,
    status: null,
    planSlug: normalizePlanSlug(data.plan_slug) || 'starter',
    planName: null,
    planId: null,
    currentPeriodEnd: toIso(data.plan_expires_at),
    trialEnd: toIso(data.trial_expires_at),
    amount: null,
    currency: String(data.currency || '').trim().toUpperCase() || null,
    raw: data,
  };
}

export async function getCurrentSubscription(businessId) {
  const id = String(businessId || '').trim();
  if (!id) return null;
  const strictSubscriptionState = isStrictSubscriptionStateEnabled();

  // Contrato oficial UI: subscription-state.
  const fromOfficialEndpoint = await getSubscriptionStateFromBackend(id);
  if (fromOfficialEndpoint) {
    console.info('[subscription-state] source=backend_subscription_state');
    return fromOfficialEndpoint;
  }

  if (strictSubscriptionState) {
    console.info('[billing-ui] strict-subscription-state enabled');
    console.info('[billing-ui] skipping current-subscription legacy fallback');
  }

  // Compat temporal: current-subscription.
  if (!strictSubscriptionState) {
    const fromLegacyEndpoint = await getCurrentSubscriptionLegacyFromBackend(id);
    if (fromLegacyEndpoint) {
      console.warn('[subscription-state] fallback=backend_current_subscription');
      return fromLegacyEndpoint;
    }
  } else {
    console.warn('[billing-ui] strict mode: subscription-state unavailable, trying table fallbacks');
  }

  // Fallback actual (se mantiene): lectura directa desde frontend.
  const fromSubscriptions = await getSubscriptionFromTable(id);
  if (fromSubscriptions) return fromSubscriptions;

  console.warn('[subscription-state] fallback=wa_businesses');
  return getFallbackFromBusiness(id);
}
