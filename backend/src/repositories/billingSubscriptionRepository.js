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
    throw new HttpError(503, '[wa-subscriptions] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
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

/** Columnas reales de public.wa_subscriptions (no inventar columnas legacy). */
const WA_SUBSCRIPTION_COLUMNS = new Set([
  'id',
  'user_id',
  'business_id',
  'email',
  'provider',
  'provider_customer_id',
  'provider_subscription_id',
  'provider_order_id',
  'provider_variant_id',
  'plan_slug',
  'status',
  'currency',
  'amount',
  'interval',
  'current_period_end',
  'trial_ends_at',
  'cancel_at',
  'cancelled_at',
  'metadata',
  'created_at',
  'updated_at',
]);

/**
 * Mapea payloads legacy (currency_code, metadata_json, etc.) al esquema wa_subscriptions.
 * Campos sin columna equivalente se guardan dentro de metadata (JSON).
 */
function normalizeWaSubscriptionRecordForUpsert(rawInput) {
  const input = { ...rawInput };
  const metadata = {};

  if (input.metadata && typeof input.metadata === 'object') {
    Object.assign(metadata, input.metadata);
  }
  if (input.metadata_json && typeof input.metadata_json === 'object') {
    Object.assign(metadata, input.metadata_json);
  }
  delete input.metadata;
  delete input.metadata_json;

  const intoMetadata = ['provider_status', 'starts_at', 'current_period_starts_at', 'cancel_at_period_end'];
  for (const k of intoMetadata) {
    if (input[k] !== undefined) {
      metadata[k] = input[k];
      delete input[k];
    }
  }

  if (input.currency_code !== undefined && input.currency === undefined) {
    input.currency = input.currency_code;
  }
  delete input.currency_code;

  if (input.interval_unit !== undefined && input.interval === undefined) {
    input.interval = input.interval_unit;
  }
  delete input.interval_unit;

  if (input.current_period_ends_at !== undefined && input.current_period_end === undefined) {
    input.current_period_end = input.current_period_ends_at;
  }
  delete input.current_period_ends_at;

  if (Object.keys(metadata).length > 0) {
    input.metadata = metadata;
  }

  const out = {};
  for (const k of Object.keys(input)) {
    if (WA_SUBSCRIPTION_COLUMNS.has(k)) {
      out[k] = input[k];
    }
  }
  return out;
}

/**
 * Expone alias legacy esperados por servicios (provider_status, current_period_ends_at, etc.)
 * leyendo desde columnas reales + metadata.
 */
function enrichSubscriptionRow(row) {
  if (!row) return null;
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    ...row,
    provider_status: meta.provider_status ?? row.provider_status ?? null,
    currency_code: row.currency ?? row.currency_code ?? null,
    interval_unit: row.interval ?? row.interval_unit ?? null,
    current_period_ends_at: row.current_period_end ?? row.current_period_ends_at ?? null,
    starts_at: meta.starts_at ?? row.starts_at ?? null,
    current_period_starts_at: meta.current_period_starts_at ?? row.current_period_starts_at ?? null,
    cancel_at_period_end: meta.cancel_at_period_end ?? row.cancel_at_period_end ?? null,
    metadata_json: row.metadata ?? row.metadata_json ?? {},
  };
}

export async function upsertBillingSubscriptionByBusiness(payload) {
  const client = getAdminClient();
  const record = cleanPayload({
    ...normalizeWaSubscriptionRecordForUpsert(payload),
    updated_at: new Date().toISOString(),
  });
  const { data, error } = await client
    .from('wa_subscriptions')
    .upsert(record, { onConflict: 'business_id' })
    .select('*')
    .single();

  if (error) {
    throw new HttpError(503, `[wa-subscriptions] upsert failed: ${error.message}`);
  }
  return enrichSubscriptionRow(data);
}

export async function getBillingSubscriptionByBusinessId(businessId) {
  const id = String(businessId || '').trim();
  if (!id) return null;
  const client = getAdminClient();
  const { data, error } = await client
    .from('wa_subscriptions')
    .select('*')
    .eq('business_id', id)
    .maybeSingle();
  if (error) {
    throw new HttpError(503, `[wa-subscriptions] read failed: ${error.message}`);
  }
  return enrichSubscriptionRow(data || null);
}
