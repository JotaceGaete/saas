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

function mapSubscriptionRow(row) {
  const planSlug = normalizePlanSlug(
    row?.plans?.slug
    || row?.plan_slug
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
  const { data, error } = await supabase
    .from('subscriptions')
    .select(`
      id,
      business_id,
      plan_id,
      status,
      plan_slug,
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
          currency,
          currency_code
        )
      )
    `)
    .eq('business_id', businessId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn('[subscription-service] subscriptions query failed', {
      businessId,
      message: error.message,
    });
    return null;
  }
  if (!data) return null;
  return mapSubscriptionRow(data);
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

async function getSubscriptionFromBackend(businessId) {
  const token = await getValidAccessToken();
  if (!token) return null;
  try {
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

  // Prioridad 1: contrato backend unificado.
  const fromBackend = await getSubscriptionFromBackend(id);
  if (fromBackend) return fromBackend;

  // Fallback actual (se mantiene): lectura directa desde frontend.
  const fromSubscriptions = await getSubscriptionFromTable(id);
  if (fromSubscriptions) return fromSubscriptions;

  return getFallbackFromBusiness(id);
}
