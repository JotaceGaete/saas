import { createClient } from '@supabase/supabase-js';

function getSupabaseUrl() {
  return String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getServiceRoleKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function getDb() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) {
    throw new Error('[paypal-webhook-events] Missing SUPABASE URL or SERVICE_ROLE_KEY');
  }
  return createClient(url, key);
}

function safePayload(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload;
}

function isDuplicateKeyError(error) {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key');
}

export async function reserveWebhookEventProcessing({ environment, eventId, eventType, payload }) {
  const id = String(eventId || '').trim();
  if (!id) throw new Error('[paypal-webhook-events] eventId is required');
  const db = getDb();
  const { error } = await db
    .from('paypal_webhook_events')
    .insert({
      environment: String(environment || '').trim(),
      event_id: id,
      event_type: String(eventType || '').trim() || null,
      status: 'processing',
      payload: safePayload(payload),
    });

  if (!error) return { reserved: true, duplicated: false };
  if (isDuplicateKeyError(error)) return { reserved: false, duplicated: true };
  throw new Error(`[paypal-webhook-events] reserve failed: ${error.message}`);
}

export async function markWebhookEventProcessed({ environment, eventId }) {
  const id = String(eventId || '').trim();
  if (!id) throw new Error('[paypal-webhook-events] eventId is required');
  const db = getDb();
  const { error } = await db
    .from('paypal_webhook_events')
    .update({
      status: 'processed',
      processed_at: new Date().toISOString(),
      processing_error: null,
    })
    .eq('environment', String(environment || '').trim())
    .eq('event_id', id);

  if (error) {
    throw new Error(`[paypal-webhook-events] mark processed failed: ${error.message}`);
  }
}

export async function markWebhookEventFailed({ environment, eventId, errorMessage }) {
  const id = String(eventId || '').trim();
  if (!id) return;
  const db = getDb();
  const { error } = await db
    .from('paypal_webhook_events')
    .update({
      status: 'failed',
      processing_error: String(errorMessage || '').trim() || null,
    })
    .eq('environment', String(environment || '').trim())
    .eq('event_id', id);

  if (error) {
    throw new Error(`[paypal-webhook-events] mark failed failed: ${error.message}`);
  }
}

