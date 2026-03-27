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

/** Columnas reales de public.billing_subscriptions (migración 20260323170000). */
const BILLING_SUBSCRIPTION_COLUMNS = new Set([
  'business_id',
  'provider',
  'provider_subscription_id',
  'plan_slug',
  'currency_code',
  'amount',
  'interval_unit',
  'status',
  'provider_status',
  'trial_ends_at',
  'starts_at',
  'current_period_starts_at',
  'current_period_ends_at',
  'cancel_at_period_end',
  'cancelled_at',
  'metadata_json',
  'updated_at',
]);

/**
 * Normaliza payload de servicios (incl. email suelto) al esquema billing_subscriptions.
 * `email` no existe en la tabla: se guarda en metadata_json.contact_email.
 */
function normalizeBillingSubscriptionRecordForUpsert(rawInput) {
  const input = { ...rawInput };
  const metadata = {};

  if (input.metadata_json && typeof input.metadata_json === 'object') {
    Object.assign(metadata, input.metadata_json);
  }
  delete input.metadata_json;

  if (input.email !== undefined && input.email !== null) {
    metadata.contact_email = input.email;
    delete input.email;
  }

  const out = {};
  for (const k of Object.keys(input)) {
    if (BILLING_SUBSCRIPTION_COLUMNS.has(k)) {
      out[k] = input[k];
    }
  }
  if (Object.keys(metadata).length > 0) {
    out.metadata_json = metadata;
  }
  return out;
}

function enrichSubscriptionRow(row) {
  if (!row) return null;
  const meta = row.metadata_json && typeof row.metadata_json === 'object' ? row.metadata_json : {};
  return {
    ...row,
    metadata_json: row.metadata_json ?? {},
    email: meta.contact_email ?? meta.subscriber_email ?? null,
    currency_code: row.currency_code ?? null,
    interval_unit: row.interval_unit ?? null,
    current_period_ends_at: row.current_period_ends_at ?? null,
    provider_status: row.provider_status ?? null,
  };
}

export async function upsertBillingSubscriptionByBusiness(payload) {
  const client = getAdminClient();
  const record = cleanPayload({
    ...normalizeBillingSubscriptionRecordForUpsert(payload),
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
  return enrichSubscriptionRow(data);
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
  return enrichSubscriptionRow(data || null);
}
