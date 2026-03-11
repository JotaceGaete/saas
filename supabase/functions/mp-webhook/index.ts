// mp-webhook — recibe notificaciones de pago de Mercado Pago.
// Público: verify_jwt = false en config.toml.
// Idempotente: si mp_payment_id ya fue procesado como 'approved', no actualiza de nuevo.
// Siempre registra un evento en wa_payment_events (audit log).
// Soporta external_reference nuevo (waP:<paymentId>:<businessId>:<planSlug>)
// y legado (<businessId>:<planSlug>) para retrocompatibilidad.

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  // ── 1. Parsear payload ─────────────────────────────────────────────────────
  let rawBody = '';
  let body: Record<string, unknown> = {};
  try {
    rawBody = await req.text();
    body    = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    console.log('[mp-webhook] bad payload: invalid JSON');
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  const type   = body?.type as string | undefined;
  const data   = body?.data as { id?: string } | undefined;
  const dataId = data?.id != null ? String(data.id) : '';

  console.log('[mp-webhook] webhook_received', { type, payment_id: dataId || null });

  // Solo procesamos notificaciones de tipo 'payment'
  if (type !== 'payment') {
    console.log('[mp-webhook] ignored: type is not payment, got:', type);
    return jsonResponse({ ok: true, ignored: true, reason: 'not_payment_type' }, 200);
  }
  if (!dataId) {
    console.log('[mp-webhook] bad payload: data.id missing');
    return jsonResponse({ ok: false, error: 'Missing data.id' }, 400);
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const mpAccessToken  = Deno.env.get('MP_ACCESS_TOKEN')           ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[mp-webhook] env: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }
  if (!mpAccessToken) {
    console.error('[mp-webhook] env: MP_ACCESS_TOKEN no configurado');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  // ── 2. Idempotencia: ¿ya procesamos este mp_payment_id como 'approved'? ────
  const { data: existingEvents } = await db
    .from('wa_payment_events')
    .select('id, mp_status, processed_at')
    .eq('mp_payment_id', dataId)
    .eq('mp_status', 'approved');

  if (existingEvents && existingEvents.length > 0) {
    console.log('[mp-webhook] idempotency: mp_payment_id', dataId,
      'ya procesado como approved en', existingEvents[0].processed_at);
    await db.from('wa_admin_notifications').insert({
      type:    'duplicate_ignored',
      title:   'Pago duplicado ignorado',
      body:    `mp_payment_id ${dataId} ya estaba procesado como approved.`,
      payload: { mp_payment_id: dataId },
    }).then(() => {}, () => {});
    return jsonResponse({ ok: true, ignored: true, reason: 'already_processed' }, 200);
  }

  // ── 3. Consultar pago real en Mercado Pago ─────────────────────────────────
  const mpRes     = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken}` },
  });
  const mpApiBody = await mpRes.text();
  console.log('[mp-webhook] MP API status:', mpRes.status, '| body (200 chars):', mpApiBody.slice(0, 200));

  if (!mpRes.ok) {
    if (mpRes.status === 401) {
      console.error('[mp-webhook] MP API 401: credenciales inválidas');
      return jsonResponse({ ok: false, error: 'Invalid MP credentials' }, 500);
    }
    console.log('[mp-webhook] MP API error', mpRes.status, '→ evento ignorado (puede ser simulación)');
    // Registrar evento igualmente para trazabilidad
    await db.from('wa_payment_events').insert({
      mp_payment_id: dataId,
      event_type:    'webhook',
      mp_status:     `mp_api_error_${mpRes.status}`,
      raw_payload:   body as Record<string, unknown>,
    });
    await db.from('wa_admin_notifications').insert({
      type:    'webhook_error',
      title:   'Webhook MP con error',
      body:    `GET payment/${dataId} devolvió ${mpRes.status}.`,
      payload: { mp_payment_id: dataId, mp_status: mpRes.status },
    }).then(() => {}, () => {});
    return jsonResponse({ ok: true, ignored: true, reason: 'mp_api_error' }, 200);
  }

  let payment: {
    status?: string;
    status_detail?: string;
    external_reference?: string;
    payment_type_id?: string;
    payment_method_id?: string;
  };
  try { payment = JSON.parse(mpApiBody); }
  catch {
    console.log('[mp-webhook] error parseando respuesta de MP');
    return jsonResponse({ ok: true, ignored: true, reason: 'invalid_mp_response' }, 200);
  }

  const mpStatus       = payment?.status        ?? '';
  const mpStatusDetail = payment?.status_detail ?? '';
  const externalRef    = payment?.external_reference;

  console.log('[mp-webhook] payment_fetched', {
    mp_payment_id:    dataId,
    mp_status:        mpStatus,
    mp_status_detail: mpStatusDetail,
    external_reference: externalRef ?? null,
  });

  // ── 4. Parsear external_reference ─────────────────────────────────────────
  // Formato nuevo:  waP:<paymentId>:<businessId>:<planSlug>
  // Formato legado: <businessId>:<planSlug>
  let paymentId:  string | null = null;
  let businessId: string | null = null;
  let planSlug:   string | null = null;

  if (externalRef) {
    if (externalRef.startsWith('waP:')) {
      const parts = externalRef.split(':');
      // waP : paymentId : businessId : planSlug
      paymentId  = parts[1] ?? null;
      businessId = parts[2] ?? null;
      planSlug   = parts[3] ?? null;
      console.log('[mp-webhook] external_reference: formato nuevo', { paymentId, businessId, planSlug });
    } else {
      // formato legado businessId:planSlug
      const parts = externalRef.split(':');
      businessId = parts[0] ?? null;
      planSlug   = parts[1] ?? null;
      console.log('[mp-webhook] external_reference: formato legado', { businessId, planSlug });
    }
  }

  // ── 5. Registrar evento de auditoría (siempre, independiente del resultado) ─
  const { data: eventRow } = await db.from('wa_payment_events').insert({
    payment_id:    paymentId ?? null,
    mp_payment_id: dataId,
    event_type:    'webhook',
    mp_status:     mpStatus,
    raw_payload:   { body, payment } as Record<string, unknown>,
  }).select('id').single();

  console.log('[mp-webhook] evento guardado en wa_payment_events, id:', eventRow?.id);

  // ── 6. Solo procesar si el pago está aprobado ─────────────────────────────
  if (mpStatus !== 'approved') {
    console.log('[mp-webhook] pago no aprobado:', mpStatus, '→ solo auditado, no se actualiza plan');

    // Actualizar wa_payments si tenemos paymentId (nuevo formato)
    if (paymentId) {
      await db.from('wa_payments').update({
        mp_payment_id:   dataId,
        mp_status:        mpStatus,
        mp_status_detail: mpStatusDetail,
        mp_payment_type:  payment?.payment_type_id  ?? null,
        mp_payment_method: payment?.payment_method_id ?? null,
        status: mpStatus === 'rejected' ? 'rejected'
               : mpStatus === 'cancelled' ? 'cancelled'
               : mpStatus === 'in_process' ? 'in_process'
               : 'pending',
        raw_mp_response: payment as Record<string, unknown>,
      }).eq('id', paymentId);
    }
    return jsonResponse({ ok: true }, 200);
  }

  // ── 7. Pago aprobado — validar datos mínimos ──────────────────────────────
  if (!businessId || !planSlug || !ALLOWED_PLANS.includes(planSlug)) {
    console.error('[mp-webhook] external_reference inválido:', externalRef);
    return jsonResponse({ ok: true, ignored: true, reason: 'invalid_external_reference' }, 200);
  }

  console.log('[mp-webhook] pago APROBADO', { mp_payment_id: dataId, businessId, planSlug, paymentId });

  // ── 8. Calcular fechas ─────────────────────────────────────────────────────
  const now           = new Date();
  const planExpiresAt = new Date(now);
  planExpiresAt.setDate(planExpiresAt.getDate() + PLAN_DURATION_DAYS);
  const planExpiresAtIso = planExpiresAt.toISOString();

  // ── 9. Actualizar wa_payments con status=approved ──────────────────────────
  if (paymentId) {
    const { error: paymentUpdateError } = await db.from('wa_payments').update({
      status:            'approved',
      mp_payment_id:     dataId,
      mp_status:         mpStatus,
      mp_status_detail:  mpStatusDetail,
      mp_payment_type:   payment?.payment_type_id   ?? null,
      mp_payment_method: payment?.payment_method_id ?? null,
      plan_activated_at: now.toISOString(),
      plan_expires_at:   planExpiresAtIso,
      raw_mp_response:   payment as Record<string, unknown>,
    }).eq('id', paymentId);

    if (paymentUpdateError) {
      console.error('[mp-webhook] error actualizando wa_payments:', paymentUpdateError.message);
    } else {
      console.log('[mp-webhook] wa_payments actualizado: id=', paymentId, 'status=approved');
    }
  }

  // ── 10. Verificar que el negocio exista antes de actualizar ──────────────
  const { data: bizRow, error: bizCheckError } = await db
    .from('wa_businesses')
    .select('id, user_id, plan_slug')
    .eq('id', businessId)
    .single();

  if (bizCheckError || !bizRow) {
    console.error('[mp-webhook] negocio no encontrado en wa_businesses:', businessId, bizCheckError?.message);
    return jsonResponse({ ok: false, error: 'Business not found' }, 404);
  }
  console.log('[mp-webhook] negocio encontrado:', { id: bizRow.id, user_id: bizRow.user_id, plan_slug_anterior: bizRow.plan_slug });

  // ── 11. Actualizar plan en wa_businesses ──────────────────────────────────
  const { error: bizUpdateError } = await db.from('wa_businesses').update({
    plan_slug:       planSlug,
    plan_expires_at: planExpiresAtIso,
  }).eq('id', businessId);

  if (bizUpdateError) {
    console.error('[mp-webhook] error actualizando wa_businesses:', bizUpdateError.message, bizUpdateError.code);
    return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
  }

  console.log('[mp-webhook] payment_approved_and_plan_updated', {
    mp_payment_id:   dataId,
    paymentId,
    businessId,
    planSlug,
    planExpiresAt:   planExpiresAtIso,
    previousPlanSlug: bizRow.plan_slug,
  });

  return jsonResponse({ ok: true }, 200);
});
