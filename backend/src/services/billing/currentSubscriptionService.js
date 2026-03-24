import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http/HttpError.js';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new HttpError(503, '[billing-current-subscription] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
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
    || row?.plan_slug
    || row?.plan
    || null,
  );
  const priceRows = Array.isArray(row?.plans?.plan_prices) ? row.plans.plan_prices : [];
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
  };
}

async function getSubscriptionFromTables(admin, businessId) {
  const { data, error } = await admin
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
    console.warn('[billing-current-subscription] subscriptions query failed', {
      businessId,
      message: error.message,
    });
    return null;
  }
  return data ? mapSubscriptionRow(data) : null;
}

async function getFallbackFromBusiness(admin, businessId) {
  const { data, error } = await admin
    .from('wa_businesses')
    .select('id, plan_slug, plan_expires_at, trial_expires_at, currency')
    .eq('id', businessId)
    .maybeSingle();
  if (error) {
    throw new HttpError(503, `[billing-current-subscription] wa_businesses read failed: ${error.message}`);
  }
  if (!data) {
    throw new HttpError(404, '[billing-current-subscription] Business not found');
  }
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
  };
}

export async function getCurrentSubscriptionState({ businessId }) {
  const id = String(businessId || '').trim();
  if (!id) throw new HttpError(400, 'businessId is required');
  const admin = getAdminClient();
  const sub = await getSubscriptionFromTables(admin, id);
  if (sub) return { ok: true, subscription: sub };
  const fallback = await getFallbackFromBusiness(admin, id);
  return { ok: true, subscription: fallback };
}
