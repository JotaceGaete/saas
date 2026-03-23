import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../lib/http/HttpError.js';

function getSupabaseUrl() {
  return String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getAdminClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new HttpError(503, '[paypal-plan-mapping] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

export async function getPaypalPlanMapping({ environment, planSlug }) {
  const env = String(environment || '').trim().toLowerCase();
  const slug = String(planSlug || '').trim().toLowerCase();
  if (!env || !slug) {
    throw new HttpError(400, '[paypal-plan-mapping] environment and planSlug are required');
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('paypal_plan_mappings')
    .select('environment, plan_slug, paypal_plan_id')
    .eq('environment', env)
    .eq('plan_slug', slug)
    .maybeSingle();

  if (error) {
    throw new HttpError(503, `[paypal-plan-mapping] Query failed: ${error.message}`);
  }

  return data || null;
}

export async function getPaypalPlanMappingByPlanId({ environment, paypalPlanId }) {
  const env = String(environment || '').trim().toLowerCase();
  const planId = String(paypalPlanId || '').trim();
  if (!env || !planId) return null;

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('paypal_plan_mappings')
    .select('environment, plan_slug, paypal_plan_id')
    .eq('environment', env)
    .eq('paypal_plan_id', planId)
    .maybeSingle();

  if (error) {
    throw new HttpError(503, `[paypal-plan-mapping] Reverse query failed: ${error.message}`);
  }

  return data || null;
}

