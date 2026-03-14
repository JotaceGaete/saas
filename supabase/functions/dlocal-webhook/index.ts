// dlocal-webhook — recibe notificaciones de pago de dLocal Go.
// Público: verify_jwt = false. Idempotente por provider + provider_payment_id.
// Solo activa plan cuando el estado sea approved/paid.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_PLANS = ['control', 'pro', 'business'];
const PLAN_DURATION_DAYS = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-login, x-date',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function normalizeStatus(dlocalStatus: string): string {
  const s = (dlocalStatus ?? '').toLowerCase();
  if (s === 'approved' || s === 'paid' || s === 'completed') return 'approved';
  if (s === 'rejected' || s === 'failed' || s === 'declined') return 'rejected';
  if (s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'expired') return 'expired';
  if (s === 'refunded') return 'refunded';
  return 'pending';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  let rawBody = '';
  let payload: Record<string, unknown> = {};
  try {
    rawBody = await req.text();
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const paymentId = payload?.id != null ? String(payload.id) : '';
  const orderId = payload?.order_id != null ? String(payload.order_id) : '';
  const status = normalizeStatus((payload?.status as string) ?? '');

  console.log('[dlocal-webhook] received', { paymentId, orderId, status, rawStatus: payload?.status });

  if (!paymentId) return jsonResponse({ ok: false, error: 'Missing payment id' }, 400);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const webhookSecret = Deno.env.get('DLOCAL_GO_WEBHOOK_SECRET') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  if (webhookSecret) {
    const xLogin = req.headers.get('x-login') ?? '';
    const xDate = req.headers.get('x-date') ?? '';
    const authHeader = (req.headers.get('authorization') ?? '').trim();
    const toSign = xLogin + xDate + rawBody;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(webhookSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(toSign));
    const expectedHex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    if (authHeader !== expectedHex && authHeader !== `Bearer ${expectedHex}`) {
      return jsonResponse({ ok: false, error: 'Invalid signature' }, 401);
    }
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  const { data: existingApproved } = await db
    .from('wa_payment_events')
    .select('id')
    .eq('provider', 'dlocal_go')
    .eq('provider_payment_id', paymentId)
    .eq('mp_status', 'approved')
    .limit(1);

  if (existingApproved?.length) {
    return jsonResponse({ ok: true, ignored: true, reason: 'already_processed' }, 200);
  }

  let paymentRecord: { id: string; business_id: string; user_id: string; plan_slug: string } | null = null;
  if (orderId) {
    const { data: row } = await db.from('wa_payments')
      .select('id, business_id, user_id, plan_slug')
      .eq('id', orderId)
      .eq('provider', 'dlocal_go')
      .maybeSingle();
    paymentRecord = row;
  }
  if (!paymentRecord && paymentId) {
    const { data: row } = await db.from('wa_payments')
      .select('id, business_id, user_id, plan_slug')
      .eq('provider', 'dlocal_go')
      .eq('provider_payment_id', paymentId)
      .maybeSingle();
    paymentRecord = row;
  }

  console.log('[dlocal-webhook] paymentRecord', paymentRecord ? { id: paymentRecord.id, business_id: paymentRecord.business_id, plan_slug: paymentRecord.plan_slug } : null);

  await db.from('wa_payment_events').insert({
    payment_id: paymentRecord?.id ?? null,
    provider: 'dlocal_go',
    provider_payment_id: paymentId,
    mp_payment_id: paymentId,
    event_type: 'webhook',
    mp_status: status,
    raw_payload: payload,
  });

  if (paymentRecord) {
    const updatePayload: Record<string, unknown> = {
      status: status === 'approved' ? 'approved' : status === 'rejected' ? 'rejected' : status,
      mp_status: (payload?.status as string) ?? null,
    };
    if (status === 'approved') {
      const planExpiresAt = new Date();
      planExpiresAt.setDate(planExpiresAt.getDate() + PLAN_DURATION_DAYS);
      updatePayload.plan_activated_at = new Date().toISOString();
      updatePayload.plan_expires_at = planExpiresAt.toISOString();
    }
    await db.from('wa_payments').update(updatePayload).eq('id', paymentRecord.id);
    console.log('[dlocal-webhook] wa_payments updated', { payment_id: paymentRecord.id, status: updatePayload.status, rawStatus: payload?.status });
  } else {
    console.log('[dlocal-webhook] no paymentRecord found for order_id or provider_payment_id, wa_payments NOT updated');
  }

  if (status === 'approved' && paymentRecord && ALLOWED_PLANS.includes(paymentRecord.plan_slug)) {
    const now = new Date();
    const planExpiresAt = new Date(now);
    planExpiresAt.setDate(planExpiresAt.getDate() + PLAN_DURATION_DAYS);
    const { error: bizErr } = await db.from('wa_businesses').update({
      plan_slug: paymentRecord.plan_slug,
      plan_started_at: now.toISOString(),
      plan_expires_at: planExpiresAt.toISOString(),
    }).eq('id', paymentRecord.business_id);
    if (bizErr) console.error('[dlocal-webhook] error updating wa_businesses:', bizErr.message);
    else console.log('[dlocal-webhook] wa_businesses updated', { business_id: paymentRecord.business_id, plan_slug: paymentRecord.plan_slug });
  }

  return jsonResponse({ ok: true }, 200);
});
