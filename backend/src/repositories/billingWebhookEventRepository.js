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
    throw new HttpError(503, '[billing-webhook-events] Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

function getEnvironment() {
  return String(process.env.DLOCAL_MODE || process.env.NODE_ENV || 'sandbox').trim().toLowerCase();
}

export async function reserveWebhookEventProcessing({
  provider,
  eventId,
  eventType,
  payload,
}) {
  const p = String(provider || '').trim().toLowerCase();
  const eId = String(eventId || '').trim();
  if (!p || !eId) throw new HttpError(400, '[billing-webhook-events] provider and eventId are required');
  const client = getAdminClient();
  const insertPayload = {
    provider: p,
    environment: getEnvironment(),
    event_id: eId,
    event_type: String(eventType || '').trim() || null,
    status: 'processing',
    payload: payload || {},
  };
  const { data, error } = await client
    .from('billing_webhook_events')
    .insert(insertPayload)
    .select('id, event_id')
    .maybeSingle();
  if (!error) return { duplicated: false, row: data || null };
  if (String(error?.message || '').toLowerCase().includes('duplicate key value')) {
    return { duplicated: true, row: null };
  }
  throw new HttpError(503, `[billing-webhook-events] reserve failed: ${error.message}`);
}

export async function markWebhookEventProcessed({ provider, eventId }) {
  const client = getAdminClient();
  const { error } = await client
    .from('billing_webhook_events')
    .update({ status: 'processed', processed_at: new Date().toISOString(), error_message: null })
    .eq('provider', String(provider || '').trim().toLowerCase())
    .eq('environment', getEnvironment())
    .eq('event_id', String(eventId || '').trim());
  if (error) throw new HttpError(503, `[billing-webhook-events] mark processed failed: ${error.message}`);
}

export async function markWebhookEventFailed({ provider, eventId, errorMessage }) {
  const client = getAdminClient();
  const { error } = await client
    .from('billing_webhook_events')
    .update({ status: 'failed', failed_at: new Date().toISOString(), error_message: String(errorMessage || '').slice(0, 900) || null })
    .eq('provider', String(provider || '').trim().toLowerCase())
    .eq('environment', getEnvironment())
    .eq('event_id', String(eventId || '').trim());
  if (error) throw new HttpError(503, `[billing-webhook-events] mark failed failed: ${error.message}`);
}
