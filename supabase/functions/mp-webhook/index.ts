// mp-webhook — recibe notificaciones de pago de Mercado Pago.
// Público: verify_jwt = false en config.toml.
// Idempotente: si mp_payment_id ya fue procesado como 'approved', no actualiza de nuevo.
// Siempre registra un evento en wa_payment_events (audit log).
// Soporta external_reference nuevo (waP:<paymentId>:<businessId>:<planSlug>)
// y legado (<businessId>:<planSlug>) para retrocompatibilidad.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_PLANS = ['control', 'starter', 'pro', 'business'];
const PLAN_DURATION_DAYS = 30;
const LOOPS_TRANSACTIONAL_URL = 'https://app.loops.so/api/v1/transactional';

// Jerarquía de planes: mayor número = plan más alto.
// 'control' y 'starter' son equivalentes (plan base).
const PLAN_ORDER: Record<string, number> = { starter: 0, control: 0, pro: 1, business: 2 };

function resolveMpAccessToken(countryCode: string): string {
  if (countryCode === 'AR') {
    const token = Deno.env.get('MP_ACCESS_TOKEN_AR');
    if (!token) throw new Error('Missing MP_ACCESS_TOKEN_AR');
    return token;
  }
  const token = Deno.env.get('MP_ACCESS_TOKEN_CL');
  if (!token) throw new Error('Missing MP_ACCESS_TOKEN_CL');
  return token;
}

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

function formatReceiptAmount(amount: unknown, currency: string) {
  const code = String(currency || 'CLP').trim().toUpperCase();
  const value = Number(amount);
  if (!Number.isFinite(value)) return '';
  const noDecimals = code === 'CLP' || code === 'ARS';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: code,
    minimumFractionDigits: noDecimals ? 0 : 2,
    maximumFractionDigits: noDecimals ? 0 : 2,
  }).format(value);
}

function formatReceiptDate(value: unknown) {
  if (!value) return '';
  const date = new Date(String(value));
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', {
    dateStyle: 'long',
    timeZone: 'America/Santiago',
  }).format(date);
}

function getPlanName(planSlug: string) {
  if (planSlug === 'business') return 'Business';
  if (planSlug === 'pro') return 'Pro';
  if (planSlug === 'control') return 'Control';
  return 'Starter';
}

function getDashboardUrl() {
  const explicit = Deno.env.get('WALINKA_DASHBOARD_URL')?.trim() || '';
  if (explicit) return explicit.replace(/\/$/, '');
  const origin = (Deno.env.get('VENTALINK_PUBLIC_ORIGIN')
    || Deno.env.get('APP_PUBLIC_ORIGIN')
    || '').trim().replace(/\/$/, '');
  return origin ? `${origin}/dashboard` : 'https://go.ventalink.app/dashboard';
}

async function sendLoopsSubscriptionReceiptEmail(dataVariables: Record<string, string>) {
  const apiKey = Deno.env.get('LOOPS_API_KEY')?.trim() || '';
  const transactionalId = Deno.env.get('LOOPS_SUBSCRIPTION_RECEIPT_TRANSACTIONAL_ID')?.trim() || '';
  if (!apiKey) return { sent: false, skippedReason: 'missing_api_key' };
  if (!transactionalId) return { sent: false, skippedReason: 'missing_transactional_id' };

  const { email, ...loopsDataVariables } = dataVariables;
  const response = await fetch(LOOPS_TRANSACTIONAL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      transactionalId,
      email,
      dataVariables: loopsDataVariables,
    }),
  });
  if (!response.ok) return { sent: false, skippedReason: 'loops_error', status: response.status };
  return { sent: true };
}

async function maybeSendMercadoPagoReceiptEmail({
  db,
  paymentId,
  providerPaymentId,
  subscriptionStatus,
  paidAt,
  nextRenewalDate,
}: {
  db: ReturnType<typeof createClient>;
  paymentId: string | null;
  providerPaymentId: string;
  subscriptionStatus: string;
  paidAt: string;
  nextRenewalDate: string;
}) {
  if (!paymentId) return;
  try {
    const { data: paymentRow, error: paymentReadError } = await db
      .from('wa_payments')
      .select('id, business_id, user_id, plan_slug, amount, currency, metadata')
      .eq('id', paymentId)
      .maybeSingle();
    if (paymentReadError || !paymentRow) {
      console.warn('[mp-webhook] receipt skipped', { paymentId, reason: 'payment_not_found' });
      return;
    }
    const metadata = paymentRow.metadata && typeof paymentRow.metadata === 'object'
      ? paymentRow.metadata as Record<string, unknown>
      : {};
    if (metadata.receipt_email_sent_at || metadata.subscription_receipt_email_sent_at) {
      console.log('[mp-webhook] receipt skipped', { paymentId, reason: 'receipt_already_sent' });
      return;
    }

    const { data: businessRow } = await db
      .from('wa_businesses')
      .select('name, email')
      .eq('id', paymentRow.business_id)
      .maybeSingle();
    const { data: userResult } = await db.auth.admin.getUserById(paymentRow.user_id);
    const email = String(userResult?.user?.email || businessRow?.email || '').trim().toLowerCase();
    if (!email) {
      console.warn('[mp-webhook] receipt skipped', { paymentId, reason: 'missing_email' });
      return;
    }

    const result = await sendLoopsSubscriptionReceiptEmail({
      email,
      customerName: String(userResult?.user?.user_metadata?.name || userResult?.user?.user_metadata?.full_name || businessRow?.name || 'Cliente'),
      businessName: String(businessRow?.name || 'Walinka'),
      planName: getPlanName(String(paymentRow.plan_slug || 'starter')),
      planPeriod: 'Mensual',
      amountFormatted: formatReceiptAmount(paymentRow.amount, String(paymentRow.currency || 'CLP')),
      currency: String(paymentRow.currency || 'CLP').toUpperCase(),
      paymentProvider: 'Mercado Pago',
      paymentId: providerPaymentId,
      subscriptionStatus,
      paidAtFormatted: formatReceiptDate(paidAt),
      nextRenewalDateFormatted: formatReceiptDate(nextRenewalDate),
      dashboardUrl: getDashboardUrl(),
    });

    const nowIso = new Date().toISOString();
    const nextMetadata = {
      ...metadata,
      receipt_email_provider: 'loops',
      receipt_email_payment_provider: 'mercado_pago',
      receipt_email_error: result.sent ? null : result.skippedReason || 'send_failed',
      ...(result.sent ? { receipt_email_sent_at: nowIso } : {}),
    };
    const fullPatch: Record<string, unknown> = {
      metadata: nextMetadata,
      receipt_email_provider: 'loops',
      receipt_email_error: result.sent ? null : result.skippedReason || 'send_failed',
      ...(result.sent ? { receipt_email_sent_at: nowIso } : {}),
    };
    const { error: receiptUpdateError } = await db.from('wa_payments').update(fullPatch).eq('id', paymentId);
    if (receiptUpdateError) {
      await db.from('wa_payments').update({ metadata: nextMetadata }).eq('id', paymentId);
    }
    if (!result.sent) {
      console.warn('[mp-webhook] receipt send skipped', {
        paymentId,
        provider_payment_id: providerPaymentId,
        reason: result.skippedReason || 'send_failed',
        status: result.status || null,
      });
    }
  } catch (error) {
    console.warn('[mp-webhook] receipt send failed', {
      paymentId,
      provider_payment_id: providerPaymentId,
      message: (error as Error)?.message || 'unknown_error',
    });
  }
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
  // let: para merchant order se sobreescribe con el payment ID resuelto
  let   dataId = data?.id != null ? String(data.id) : '';

  // Merchant order: topic_merchant_order_wh (nuevo formato) o merchant_order (IPN legado)
  const isMerchantOrder = type === 'topic_merchant_order_wh' || type === 'merchant_order';

  console.log('[mp-webhook] webhook_received', { type, data_id: dataId || null, is_merchant_order: isMerchantOrder });

  if (type !== 'payment' && !isMerchantOrder) {
    console.log('[mp-webhook] ignored: type not supported, got:', type);
    return jsonResponse({ ok: true, ignored: true, reason: 'not_supported_type' }, 200);
  }
  if (!dataId) {
    console.log('[mp-webhook] bad payload: data.id missing');
    return jsonResponse({ ok: false, error: 'Missing data.id' }, 400);
  }

  // País derivado del query param que create-mp-preference añade a la notification_url.
  // Ejemplo: https://.../mp-webhook?country=AR
  const reqUrl      = new URL(req.url);
  const countryHint = (reqUrl.searchParams.get('country') ?? 'CL').toUpperCase();

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[mp-webhook] env: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  // Resolver token según país — falla rápido si no está configurado.
  let mpAccessToken: string;
  try {
    mpAccessToken = resolveMpAccessToken(countryHint);
  } catch (e) {
    console.error('[mp-webhook] token config error:', (e as Error).message, { countryHint });
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  // ── 2. Resolver payment ID desde merchant order (si aplica) ─────────────────
  // Para tipo 'payment': dataId ya es el payment ID — nada que resolver.
  // Para merchant order: dataId es el MO ID — consultar la API y extraer el payment aprobado,
  // luego sobreescribir dataId para que todo el flujo downstream lo use normalmente.
  if (isMerchantOrder) {
    const merchantOrderId = dataId;
    console.log('[mp-webhook] merchant_order_resolving', { merchantOrderId, country: countryHint });

    const moRes  = await fetch(`https://api.mercadopago.com/merchant_orders/${merchantOrderId}`, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });
    const moBody = await moRes.text();
    console.log('[mp-webhook] merchant_order API status:', moRes.status, '| body (300 chars):', moBody.slice(0, 300));

    if (!moRes.ok) {
      console.error('[mp-webhook] error fetching merchant order:', merchantOrderId, moRes.status);
      await db.from('wa_payment_events').insert({
        mp_payment_id: merchantOrderId,
        event_type:    'webhook_merchant_order_error',
        mp_status:     `mo_api_error_${moRes.status}`,
        raw_payload:   body as Record<string, unknown>,
      }).catch(() => {});
      return jsonResponse({ ok: true, ignored: true, reason: 'merchant_order_fetch_error' }, 200);
    }

    let merchantOrder: {
      id?: number | string;
      status?: string;
      payments?: Array<{ id?: number | string; status?: string }>;
    };
    try { merchantOrder = JSON.parse(moBody); }
    catch {
      console.error('[mp-webhook] error parseando merchant order');
      return jsonResponse({ ok: true, ignored: true, reason: 'invalid_merchant_order_response' }, 200);
    }

    console.log('[MP WEBHOOK] merchantOrder.payments:', merchantOrder.payments);

    const approvedPayment = merchantOrder.payments?.find(p => p.status === 'approved');
    if (!approvedPayment) {
      console.warn('[MP WEBHOOK] no approved payment in merchant order');
      return new Response('ok', { status: 200 });
    }

    const resolvedPaymentId = String(approvedPayment.id);
    console.log('[mp-webhook] merchant_order_resolved', { merchantOrderId, resolvedPaymentId });
    dataId = resolvedPaymentId; // a partir de aquí, dataId es el payment ID real
  }

  // ── 4. Idempotencia: ¿ya procesamos este mp_payment_id como 'approved'? ────
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

  // ── 3. Consultar pago real en Mercado Pago — una sola llamada, token determinístico ──
  const mpRes     = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${mpAccessToken}` },
  });
  const mpApiBody = await mpRes.text();
  console.log('[mp-webhook] MP API status:', mpRes.status, '| country:', countryHint, '| body (200 chars):', mpApiBody.slice(0, 200));

  if (!mpRes.ok) {
    if (mpRes.status === 401) {
      console.error('[mp-webhook] MP API 401: token incorrecto para país', countryHint);
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

  // ── 8. Verificar negocio y determinar estado de trial (fuente de verdad) ────
  // Se hace ANTES de calcular fechas para que bizIsActiveTrial guíe todo lo demás.
  const { data: bizRow, error: bizCheckError } = await db
    .from('wa_businesses')
    .select('id, user_id, plan_slug, plan_expires_at, country_code, trial_expires_at, scheduled_plan_slug')
    .eq('id', businessId)
    .single();

  if (bizCheckError || !bizRow) {
    console.error('[mp-webhook] negocio no encontrado en wa_businesses:', businessId, bizCheckError?.message);
    return jsonResponse({ ok: false, error: 'Business not found' }, 404);
  }

  const bizCountry        = (bizRow.country_code   as string | null) ?? 'CL';
  const bizTrialExpiresAt = (bizRow.trial_expires_at as string | null) ?? null;
  const nowMs             = Date.now();
  // Fuente de verdad: trial activo según el campo real de la BD, no el metadata del pago.
  const bizIsActiveTrial  = bizTrialExpiresAt !== null && new Date(bizTrialExpiresAt).getTime() > nowMs;

  console.log('[MP WEBHOOK] validated payment', {
    paymentId:        dataId,
    businessId,
    country:          bizCountry,
    status:           mpStatus,
    trial_expires_at: bizTrialExpiresAt,
    is_active_trial:  bizIsActiveTrial,
  });
  console.log('[mp-webhook] negocio encontrado:', {
    id:                bizRow.id,
    plan_slug_anterior: bizRow.plan_slug,
    country_code:      bizCountry,
    trial_expires_at:  bizTrialExpiresAt,
  });
  if (bizCountry !== countryHint) {
    console.warn('[mp-webhook] country mismatch: URL param=', countryHint, '!= business.country_code=', bizCountry);
  }

  // ── 9. Calcular fechas ─────────────────────────────────────────────────────
  // Si hay trial activo: los 30 días pagos corren desde el fin del trial.
  // Si no: activación inmediata.
  const now = new Date();
  let planActivatedAtIso: string;
  let planExpiresAtIso: string;
  if (bizIsActiveTrial && bizTrialExpiresAt) {
    planActivatedAtIso = bizTrialExpiresAt;
    const endOfPeriod  = new Date(bizTrialExpiresAt);
    endOfPeriod.setDate(endOfPeriod.getDate() + PLAN_DURATION_DAYS);
    planExpiresAtIso   = endOfPeriod.toISOString();
  } else {
    planActivatedAtIso = now.toISOString();
    const planExpiresAt = new Date(now);
    planExpiresAt.setDate(planExpiresAt.getDate() + PLAN_DURATION_DAYS);
    planExpiresAtIso    = planExpiresAt.toISOString();
  }

  // ── 10. Actualizar wa_payments con status=approved ─────────────────────────
  const waPaymentsUpdate = {
    status:              'approved',
    provider_payment_id: dataId,
    mp_payment_id:       dataId,
    mp_status:           mpStatus,
    mp_status_detail:    mpStatusDetail,
    mp_payment_type:     payment?.payment_type_id  ?? null,
    mp_payment_method:   payment?.payment_method_id ?? null,
    plan_activated_at:   planActivatedAtIso,
    plan_expires_at:     planExpiresAtIso,
    raw_mp_response:     payment as Record<string, unknown>,
  };
  let receiptPaymentId: string | null = paymentId;

  if (paymentId) {
    // Ruta normal: actualizamos por id (UUID de wa_payments en external_reference)
    const { error: payErr } = await db.from('wa_payments')
      .update(waPaymentsUpdate)
      .eq('id', paymentId);
    if (payErr) {
      console.error('[mp-webhook] error actualizando wa_payments (por id):', payErr.message);
    } else {
      console.log('[mp-webhook] wa_payments actualizado', { paymentId, provider_payment_id: dataId, status: 'approved' });
    }
  } else {
    // Fallback: sin paymentId en external_reference (formato legado) — buscar por business+plan+pending
    const { data: pendingRows } = await db
      .from('wa_payments')
      .select('id')
      .eq('business_id', businessId)
      .eq('plan_slug',   planSlug)
      .eq('status',      'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    const fallbackId = pendingRows?.[0]?.id ?? null;
    receiptPaymentId = fallbackId;
    console.log('[mp-webhook] paymentId null — fallback wa_payments:', { fallbackId, businessId, planSlug });
    if (fallbackId) {
      const { error: payErr } = await db.from('wa_payments')
        .update(waPaymentsUpdate)
        .eq('id', fallbackId);
      if (payErr) {
        console.error('[mp-webhook] error actualizando wa_payments (fallback):', payErr.message);
      } else {
        console.log('[mp-webhook] wa_payments actualizado (fallback)', { fallbackId, provider_payment_id: dataId });
      }
    }
  }

  // ── 11. Actualizar plan en wa_businesses ──────────────────────────────────
  // Regla única basada en PLAN_ORDER, independiente del estado de trial:
  // - upgrade/renovación (newOrder >= currentOrder) → aplicar inmediatamente, cerrar trial.
  // - downgrade (newOrder < currentOrder) con período activo → programar al vencimiento.
  // - downgrade sin período activo → aplicar inmediatamente.
  //
  // "Período activo" cubre trial vigente Y plan pagado vigente.
  const currentPlan  = (bizRow.plan_slug as string) ?? 'starter';
  const currentOrder = PLAN_ORDER[currentPlan]  ?? 0;
  const newOrder     = PLAN_ORDER[planSlug]      ?? 0;

  // Fin del período activo: trial en curso tiene prioridad; si no hay trial, plan_expires_at.
  const activePeriodEnd: string | null =
    bizIsActiveTrial && bizTrialExpiresAt
      ? bizTrialExpiresAt
      : (bizRow.plan_expires_at !== null &&
         new Date(bizRow.plan_expires_at as string).getTime() > Date.now()
           ? (bizRow.plan_expires_at as string)
           : null);

  if (newOrder >= currentOrder || activePeriodEnd === null) {
    // UPGRADE, renovación o sin período activo → aplicar inmediatamente.
    const { error: bizUpdateError } = await db.from('wa_businesses').update({
      plan_slug:           planSlug,
      plan_expires_at:     planExpiresAtIso,
      trial_expires_at:    null,
      scheduled_plan_slug: null,
      scheduled_change_at: null,
    }).eq('id', businessId);

    if (bizUpdateError) {
      console.error('[mp-webhook] error actualizando wa_businesses (upgrade/renew):', bizUpdateError.message, bizUpdateError.code);
      return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
    }
    console.log('[mp-webhook] payment_approved_plan_applied_immediately', {
      mp_payment_id:    dataId,
      paymentId,
      businessId,
      previousPlan:     currentPlan,
      wasDuringTrial:   bizIsActiveTrial,
      planSlug,
      planExpiresAt:    planExpiresAtIso,
      isUpgrade:        newOrder > currentOrder,
    });

    // Sincronizar billing_subscriptions: actualización completa del estado activo.
    const { error: subSyncError } = await db
      .from('billing_subscriptions')
      .update({
        plan_slug:                planSlug,
        status:                   'active',
        provider:                 'mercado_pago',
        trial_ends_at:            null,
        current_period_starts_at: now.toISOString(),
        current_period_ends_at:   planExpiresAtIso,
      })
      .eq('business_id', businessId);
    if (subSyncError) {
      console.error('[mp-webhook] billing_subscriptions sync failed (non-blocking):', subSyncError.message);
    }
  } else {
    // DOWNGRADE con período activo → programar al vencimiento (trial o plan pagado).
    const { error: bizUpdateError } = await db.from('wa_businesses').update({
      scheduled_plan_slug: planSlug,
      scheduled_change_at: activePeriodEnd,
    }).eq('id', businessId);

    if (bizUpdateError) {
      console.error('[mp-webhook] error actualizando wa_businesses (downgrade scheduled):', bizUpdateError.message, bizUpdateError.code);
      return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
    }
    console.log('[mp-webhook] payment_approved_downgrade_scheduled', {
      mp_payment_id:       dataId,
      paymentId,
      businessId,
      currentPlan,
      newPlan:             planSlug,
      wasDuringTrial:      bizIsActiveTrial,
      scheduled_change_at: activePeriodEnd,
    });
  }

  const receiptEmailPromise = maybeSendMercadoPagoReceiptEmail({
    db,
    paymentId: receiptPaymentId,
    providerPaymentId: dataId,
    subscriptionStatus: 'active',
    paidAt: planActivatedAtIso,
    nextRenewalDate: planExpiresAtIso,
  });
  const waitUntil = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (promise: Promise<void>) => void } })?.EdgeRuntime?.waitUntil;
  if (waitUntil) {
    waitUntil(receiptEmailPromise);
  } else {
    receiptEmailPromise.catch(() => {});
  }

  return jsonResponse({ ok: true }, 200);
});
