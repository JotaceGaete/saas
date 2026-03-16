// paddle-webhook — recibe notificaciones de pago de Paddle (transaction.completed).
// Público: verify_jwt = false en config.toml.
// Idempotente: si el pago ya está approved, no actualiza de nuevo.
// Registra evento en wa_payment_events (provider=paddle, provider_payment_id=transaction id).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_PLANS = ['control', 'pro', 'business'];
const PLAN_DURATION_DAYS = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  let rawBody = '';
  let body: Record<string, unknown> = {};
  try {
    rawBody = await req.text();
    body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    console.log('[paddle-webhook] bad payload: invalid JSON');
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const eventType = body?.event_type as string | undefined;
  const data = body?.data as { id?: string; custom_data?: { payment_id?: string }; status?: string } | undefined;
  const transactionId = data?.id != null ? String(data.id) : '';
  const customData = data?.custom_data as { payment_id?: string } | undefined;
  const paymentId = customData?.payment_id ?? '';

  console.log('[paddle-webhook] webhook_received', { event_type: eventType, transaction_id: transactionId, payment_id: paymentId || null });

  if (eventType !== 'transaction.completed') {
    console.log('[paddle-webhook] ignored: type is not transaction.completed, got:', eventType);
    return jsonResponse({ ok: true, ignored: true, reason: 'not_transaction_completed' }, 200);
  }
  if (!transactionId) {
    console.log('[paddle-webhook] bad payload: data.id missing');
    return jsonResponse({ ok: false, error: 'Missing data.id' }, 400);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[paddle-webhook] env: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  // Idempotencia: ya procesado como approved para este provider_payment_id
  const { data: existingEvents } = await db
    .from('wa_payment_events')
    .select('id, processed_at')
    .eq('provider', 'paddle')
    .eq('provider_payment_id', transactionId);

  if (existingEvents && existingEvents.length > 0) {
    console.log('[paddle-webhook] idempotency: transaction', transactionId, 'ya procesado en', existingEvents[0].processed_at);
    return jsonResponse({ ok: true, ignored: true, reason: 'already_processed' }, 200);
  }

  // Resolver payment: por custom_data.payment_id o por provider_payment_id (incluye metadata para trial PRO→PRO)
  let paymentRow: { id: string; business_id: string; plan_slug: string; status: string; metadata?: { isScheduledTrialConversion?: boolean; effectiveAt?: string } | null } | null = null;
  if (paymentId) {
    const { data: byId } = await db
      .from('wa_payments')
      .select('id, business_id, plan_slug, status, metadata')
      .eq('id', paymentId)
      .eq('provider', 'paddle')
      .maybeSingle();
    paymentRow = byId ?? null;
  }
  if (!paymentRow) {
    const { data: byTxn } = await db
      .from('wa_payments')
      .select('id, business_id, plan_slug, status, metadata')
      .eq('provider', 'paddle')
      .eq('provider_payment_id', transactionId)
      .maybeSingle();
    paymentRow = byTxn ?? null;
  }

  if (!paymentRow) {
    console.log('[paddle-webhook] no wa_payments found for transaction', transactionId, 'payment_id', paymentId);
    await db.from('wa_payment_events').insert({
      mp_payment_id: transactionId,
      provider: 'paddle',
      provider_payment_id: transactionId,
      event_type: 'webhook',
      mp_status: 'completed',
      raw_payload: body as Record<string, unknown>,
    }).then(() => {}, () => {});
    return jsonResponse({ ok: true, ignored: true, reason: 'payment_not_found' }, 200);
  }

  if (paymentRow.status === 'approved') {
    console.log('[paddle-webhook] payment already approved:', paymentRow.id);
    await db.from('wa_payment_events').insert({
      payment_id: paymentRow.id,
      mp_payment_id: transactionId,
      provider: 'paddle',
      provider_payment_id: transactionId,
      event_type: 'webhook',
      mp_status: 'approved',
      raw_payload: body as Record<string, unknown>,
    }).then(() => {}, () => {});
    return jsonResponse({ ok: true, ignored: true, reason: 'already_approved' }, 200);
  }

  if (!ALLOWED_PLANS.includes(paymentRow.plan_slug)) {
    console.log('[paddle-webhook] invalid plan_slug:', paymentRow.plan_slug);
    return jsonResponse({ ok: true, ignored: true, reason: 'invalid_plan' }, 200);
  }

  const now = new Date();
  const paymentMeta = (paymentRow.metadata as { isScheduledTrialConversion?: boolean; effectiveAt?: string } | null) ?? null;
  const isScheduledTrialConversion = !!paymentMeta?.isScheduledTrialConversion && !!paymentMeta?.effectiveAt;
  const effectiveAtIso = paymentMeta?.effectiveAt ?? null;

  let planActivatedAtIso: string;
  let planExpiresAtIso: string;
  if (isScheduledTrialConversion && effectiveAtIso) {
    planActivatedAtIso = effectiveAtIso;
    const endOfPeriod = new Date(effectiveAtIso);
    endOfPeriod.setDate(endOfPeriod.getDate() + PLAN_DURATION_DAYS);
    planExpiresAtIso = endOfPeriod.toISOString();
  } else {
    planActivatedAtIso = now.toISOString();
    const planExpiresAt = new Date(now);
    planExpiresAt.setDate(planExpiresAt.getDate() + PLAN_DURATION_DAYS);
    planExpiresAtIso = planExpiresAt.toISOString();
  }

  await db.from('wa_payment_events').insert({
    payment_id: paymentRow.id,
    mp_payment_id: transactionId,
    provider: 'paddle',
    provider_payment_id: transactionId,
    event_type: 'webhook',
    mp_status: 'completed',
    raw_payload: body as Record<string, unknown>,
  });

  const { error: paymentUpdateError } = await db.from('wa_payments').update({
    status: 'approved',
    provider_payment_id: transactionId,
    plan_activated_at: planActivatedAtIso,
    plan_expires_at: planExpiresAtIso,
    updated_at: now.toISOString(),
  }).eq('id', paymentRow.id);

  if (paymentUpdateError) {
    console.error('[paddle-webhook] error actualizando wa_payments:', paymentUpdateError.message);
    return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
  }

  if (isScheduledTrialConversion && effectiveAtIso) {
    const { error: bizUpdateError } = await db.from('wa_businesses').update({
      scheduled_plan_slug: paymentRow.plan_slug,
      scheduled_change_at: effectiveAtIso,
    }).eq('id', paymentRow.business_id);
    if (bizUpdateError) {
      console.error('[paddle-webhook] error actualizando wa_businesses (scheduled):', bizUpdateError.message);
      return jsonResponse({ ok: false, error: 'Business update failed' }, 500);
    }
    console.log('[paddle-webhook] payment_approved_scheduled_at_trial_end', {
      transaction_id: transactionId,
      payment_id: paymentRow.id,
      business_id: paymentRow.business_id,
      plan_slug: paymentRow.plan_slug,
      scheduled_change_at: effectiveAtIso,
    });
  } else {
    const { error: bizUpdateError } = await db.from('wa_businesses').update({
      plan_slug: paymentRow.plan_slug,
      plan_expires_at: planExpiresAtIso,
    }).eq('id', paymentRow.business_id);
    if (bizUpdateError) {
      console.error('[paddle-webhook] error actualizando wa_businesses:', bizUpdateError.message);
      return jsonResponse({ ok: false, error: 'Business update failed' }, 500);
    }
    console.log('[paddle-webhook] payment_approved_and_plan_updated', {
      transaction_id: transactionId,
      payment_id: paymentRow.id,
      business_id: paymentRow.business_id,
      plan_slug: paymentRow.plan_slug,
      plan_expires_at: planExpiresAtIso,
    });
  }

  return jsonResponse({ ok: true }, 200);
});
