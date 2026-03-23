import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../lib/http/HttpError.js';

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
    throw new HttpError(503, '[billing-subscriptions] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

function cleanPayload(payload) {
  const base = { ...payload };
  Object.keys(base).forEach((key) => {
    if (base[key] === undefined) delete base[key];
  });
  return base;
}

export async function upsertBillingSubscriptionByBusiness(payload) {
  const client = getAdminClient();
  const record = cleanPayload({
    ...payload,
    updated_at: new Date().toISOString(),
  });
  const { data, error } = await client
    .from('billing_subscriptions')
    .upsert(record, { onConflict: 'business_id' })
    .select('*')
    .single();

  if (error) {
    throw new HttpError(503, `[billing-subscriptions] upsert failed: ${error.message}`);
  }
  return data;
}

export async function getBillingSubscriptionByBusinessId(businessId) {
  const id = String(businessId || '').trim();
  if (!id) return null;
  const client = getAdminClient();
  const { data, error } = await client
    .from('billing_subscriptions')
    .select('*')
    .eq('business_id', id)
    .maybeSingle();
  if (error) {
    throw new HttpError(503, `[billing-subscriptions] read failed: ${error.message}`);
  }
  return data || null;
}
