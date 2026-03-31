import { supabase } from '../supabase';

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

export async function getCurrentSubscription(businessId) {
  const id = String(businessId || '').trim();
  if (!id) return null;

  const fromOfficialEndpoint = await getSubscriptionStateFromBackend(id);
  if (fromOfficialEndpoint) {
    console.info('[subscription-state] source=backend_subscription_state');
    return fromOfficialEndpoint;
  }
  console.warn('[billing-ui] subscription-state unavailable; returning null');
  return null;
}
