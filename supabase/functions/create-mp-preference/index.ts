// create-mp-preference — crea preferencia de pago en Mercado Pago.
// Seguridad: business resuelto 100% por SERVICE_ROLE + auth.uid(). No acepta businessId del frontend.
// Persiste wa_payments (pending) antes de llamar a MP. Idempotencia garantizada por wa_payments.id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Catálogo centralizado (misma lógica que plan-change-preview)
const PLAN_ORDER: Record<string, number> = { starter: 0, control: 1, pro: 2, business: 3 };
const PLAN_CATALOG: Record<string, { displayName: string; price: number; durationDays: number }> = {
  starter:  { displayName: 'Starter',  price: 0,     durationDays: 30 },
  control:  { displayName: 'Plan Control', price: 500,  durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 5000, durationDays: 30 },
  business: { displayName: 'Plan Business', price: 10000, durationDays: 30 },
};
const PRORATION_FORMULA_VERSION = '2024-03-exact-time';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ChangeType = 'upgrade' | 'renewal' | 'downgrade';

function computePlanChange(
  currentPlanSlug: string,
  planExpiresAt: string | null,
  targetPlanSlug: string,
): {
  changeType: ChangeType;
  finalAmount: number;
  daysRemaining: number;
  creditAmount: number;
  currentPlanPrice: number;
  targetPlanPrice: number;
  effectiveAt?: string;
  scheduledChange?: { targetPlanSlug: string; effectiveAt: string };
  prorationFormulaVersion: string;
} {
  const now = Date.now();
  const currentOrder = PLAN_ORDER[currentPlanSlug] ?? 0;
  const targetOrder = PLAN_ORDER[targetPlanSlug] ?? 0;
  const currentPlanPrice = PLAN_CATALOG[currentPlanSlug]?.price ?? 0;
  const targetPlanPrice = PLAN_CATALOG[targetPlanSlug]?.price ?? 0;

  let changeType: ChangeType = 'renewal';
  if (targetOrder > currentOrder) changeType = 'upgrade';
  else if (targetOrder < currentOrder) changeType = 'downgrade';

  let remainingMs = 0;
  if (planExpiresAt) {
    const exp = new Date(planExpiresAt).getTime();
    remainingMs = Math.max(0, exp - now);
  }
  const msPerPeriod = (PLAN_CATALOG[currentPlanSlug]?.durationDays ?? 30) * MS_PER_DAY;
  const remainingDaysFraction = msPerPeriod > 0
    ? Math.min((remainingMs / msPerPeriod) * (PLAN_CATALOG[currentPlanSlug]?.durationDays ?? 30), 30)
    : 0;
  const daysRemaining = Math.floor(remainingDaysFraction);

  let creditAmount = 0;
  if (changeType === 'upgrade' && currentPlanPrice > 0) {
    const rawCredit = (currentPlanPrice / 30) * remainingDaysFraction;
    creditAmount = Math.floor(rawCredit);
    creditAmount = Math.min(creditAmount, currentPlanPrice);
  }

  let finalAmount = targetPlanPrice;
  if (changeType === 'upgrade') {
    finalAmount = Math.max(0, Math.floor(targetPlanPrice - creditAmount));
  } else if (changeType === 'downgrade') finalAmount = 0;

  let effectiveAt: string | undefined;
  let scheduledChange: { targetPlanSlug: string; effectiveAt: string } | undefined;
  if (changeType === 'downgrade' && planExpiresAt) {
    effectiveAt = new Date(planExpiresAt).toISOString();
    scheduledChange = { targetPlanSlug, effectiveAt };
  } else if (changeType === 'renewal' || changeType === 'upgrade') {
    if (planExpiresAt) {
      const exp = new Date(planExpiresAt).getTime();
      effectiveAt = exp > now ? planExpiresAt : new Date(now).toISOString();
    } else {
      effectiveAt = new Date(now).toISOString();
    }
  }

  return {
    changeType,
    finalAmount,
    daysRemaining,
    creditAmount,
    currentPlanPrice,
    targetPlanPrice,
    effectiveAt,
    scheduledChange,
    prorationFormulaVersion: PRORATION_FORMULA_VERSION,
  };
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  console.log('[create-mp-preference] method:', req.method);
  console.log('[create-mp-preference] authorization present:', authHeader.length > 0);

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl      = Deno.env.get('SUPABASE_URL')              ?? '';
  const anonKey          = Deno.env.get('SUPABASE_ANON_KEY')         ?? '';
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const mpAccessToken    = Deno.env.get('MP_ACCESS_TOKEN')           ?? '';
  const appBaseUrl       = (Deno.env.get('APP_BASE_URL') ?? 'https://app.gong.cl').replace(/\/$/, '');
  const notificationUrl  = Deno.env.get('MP_WEBHOOK_URL')            ?? '';

  if (!serviceRoleKey) {
    console.error('[create-mp-preference] SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  if (!mpAccessToken) {
    console.error('[create-mp-preference] MP_ACCESS_TOKEN not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // ── 1. Validar usuario desde el JWT ────────────────────────────────────────
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.log('[create-mp-preference] 401: JWT inválido', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }
  console.log('[create-mp-preference] auth.uid():', user.id);
  console.log('[create-mp-preference] auth.email():', user.email ?? '(sin email)');

  // ── 2. Parsear body — businessId ignorado explícitamente ──────────────────
  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (body?.businessId) {
    console.warn('[create-mp-preference] businessId en body IGNORADO — se resuelve solo por auth.uid()');
  }

  const planSlug = body?.planSlug as string | undefined;
  const price    = planSlug ? PLAN_CATALOG[planSlug]?.price : undefined;
  console.log('[create-mp-preference] planSlug:', planSlug ?? '(none)', '| price:', price ?? '(inválido)');
  if (!planSlug || !PLAN_ORDER[planSlug]) {
    return jsonResponse({ error: 'Plan no válido' }, 400);
  }

  // ── 3. Resolver negocio con SERVICE_ROLE (sin RLS, sin ambigüedad) ─────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id, name, plan_slug, plan_expires_at')
    .eq('user_id', user.id);

  const rowCount = businesses?.length ?? 0;
  console.log('[create-mp-preference] wa_businesses para auth.uid()', user.id, '→ count:', rowCount);
  businesses?.forEach((b, i) =>
    console.log(`[create-mp-preference] business[${i}]: id=${b.id} user_id=${b.user_id} name="${b.name}"`),
  );

  if (bizError) {
    console.error('[create-mp-preference] error query wa_businesses:', bizError.message);
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }
  if (rowCount === 0) {
    console.error('[create-mp-preference] 404: ningún negocio para', user.id);
    return jsonResponse({ error: 'Business not found for user', reason: 'no_business' }, 404);
  }
  if (rowCount > 1) {
    console.error('[create-mp-preference] 409: múltiples negocios para', user.id,
      '→ ids:', businesses!.map(b => b.id).join(', '));
    return jsonResponse({ error: 'Multiple businesses found', reason: 'multiple_businesses', count: rowCount }, 409);
  }

  const business = businesses![0];
  if (business.user_id !== user.id) {
    console.error('[create-mp-preference] 403: mismatch user_id', { business_user_id: business.user_id, auth_uid: user.id });
    return jsonResponse({ error: 'Forbidden', reason: 'ownership_mismatch' }, 403);
  }

  console.log('[create-mp-preference] business.id elegido:', business.id);
  console.log('[create-mp-preference] business.user_id confirmado:', business.user_id);

  // ── 4. Calcular tipo de cambio y monto final (prorrateo en upgrades) ───────
  const currentPlanSlug = (business as { plan_slug?: string }).plan_slug ?? 'starter';
  const planExpiresAt   = (business as { plan_expires_at?: string | null }).plan_expires_at ?? null;
  const planChange      = computePlanChange(currentPlanSlug, planExpiresAt, planSlug);

  if (planChange.changeType === 'downgrade') {
    const effectiveAt = planExpiresAt ?? new Date().toISOString();
    const { error: updateErr } = await adminClient
      .from('wa_businesses')
      .update({
        scheduled_plan_slug: planSlug,
        scheduled_change_at: effectiveAt,
      })
      .eq('id', business.id);
    if (updateErr) {
      console.error('[create-mp-preference] error al persistir downgrade programado:', updateErr.message);
      return jsonResponse({ error: 'No se pudo programar el cambio de plan' }, 500);
    }
    console.log('[create-mp-preference] downgrade programado en BD', {
      businessId: business.id,
      scheduled_plan_slug: planSlug,
      scheduled_change_at: effectiveAt,
    });
    return jsonResponse({
      error:      'Downgrade no requiere pago',
      changeType:  'downgrade',
      message:    'El cambio a un plan inferior se aplicará al vencer tu plan actual. No se realiza ningún cargo.',
      scheduledChange: { targetPlanSlug: planSlug, effectiveAt },
    }, 400);
  }

  const finalAmount = planChange.finalAmount;
  const metadata = {
    currentPlanSlug,
    currentPlanPrice: planChange.currentPlanPrice,
    targetPlanSlug:   planSlug,
    targetPlanPrice:  planChange.targetPlanPrice,
    daysRemaining:    planChange.daysRemaining,
    creditAmount:     planChange.creditAmount,
    finalAmount:      planChange.finalAmount,
    changeType:       planChange.changeType,
    computedAt:       new Date().toISOString(),
    prorationFormulaVersion: planChange.prorationFormulaVersion,
    effectiveAt:      planChange.effectiveAt ?? null,
    scheduledChange:  planChange.scheduledChange ?? null,
  };
  console.log('[create-mp-preference] planChange', metadata);

  // ── Upgrade con finalAmount === 0: aplicar cambio interno, no crear preferencia MP ──
  if (finalAmount === 0) {
    const effectiveAtMs = planChange.effectiveAt ? new Date(planChange.effectiveAt).getTime() : Date.now();
    const newExpiresAt = new Date(effectiveAtMs + 30 * MS_PER_DAY).toISOString();
    const { error: bizUpdateErr } = await adminClient
      .from('wa_businesses')
      .update({ plan_slug: planSlug, plan_expires_at: newExpiresAt })
      .eq('id', business.id);
    if (bizUpdateErr) {
      console.error('[create-mp-preference] error al aplicar upgrade gratis:', bizUpdateErr.message);
      return jsonResponse({ error: 'No se pudo aplicar el cambio de plan' }, 500);
    }
    const internalMetadata = {
      ...metadata,
      provider: 'internal_proration',
    };
    const { data: internalPayment, error: paymentInsertError } = await adminClient
      .from('wa_payments')
      .insert({
        business_id:         business.id,
        user_id:             user.id,
        plan_slug:           planSlug,
        amount:              0,
        currency:            'CLP',
        status:              'approved',
        external_reference:  'internal_proration',
        metadata:            internalMetadata,
        plan_activated_at:   new Date().toISOString(),
        plan_expires_at:     newExpiresAt,
      })
      .select('id')
      .single();
    if (paymentInsertError || !internalPayment?.id) {
      console.error('[create-mp-preference] error al registrar pago interno:', paymentInsertError?.message);
      return jsonResponse({ error: 'No se pudo registrar el pago interno' }, 500);
    }
    console.log('[create-mp-preference] upgrade aplicado sin MP (finalAmount=0)', {
      businessId: business.id,
      planSlug,
      plan_expires_at: newExpiresAt,
      paymentId: internalPayment.id,
    });
    return jsonResponse({
      applied:        true,
      planSlug,
      plan_expires_at: newExpiresAt,
      payment_id:     internalPayment.id,
    }, 200);
  }

  // ── 5. Crear registro de pago pendiente en wa_payments ────────────────────
  const { data: paymentRow, error: paymentInsertError } = await adminClient
    .from('wa_payments')
    .insert({
      business_id:        business.id,
      user_id:            user.id,
      plan_slug:          planSlug,
      amount:             finalAmount,
      currency:           'CLP',
      status:             'pending',
      external_reference: 'pending',
      metadata,
    })
    .select('id')
    .single();

  if (paymentInsertError || !paymentRow?.id) {
    console.error('[create-mp-preference] error al crear wa_payments:', paymentInsertError?.message);
    return jsonResponse({ error: 'No se pudo registrar el intento de pago' }, 500);
  }

  const paymentId        = paymentRow.id;
  const externalReference = `waP:${paymentId}:${business.id}:${planSlug}`;
  console.log('[create-mp-preference] payment_id (wa_payments):', paymentId);
  console.log('[create-mp-preference] external_reference (final):', externalReference);

  // Actualizar external_reference con el id real
  await adminClient
    .from('wa_payments')
    .update({ external_reference: externalReference })
    .eq('id', paymentId);

  // ── 5. Crear preferencia en Mercado Pago ──────────────────────────────────
  const successUrl = (body?.success_url as string) || `${appBaseUrl}/plans?payment=success`;
  const failureUrl = (body?.failure_url as string) || `${appBaseUrl}/plans?payment=failure`;
  const pendingUrl = (body?.pending_url as string) || `${appBaseUrl}/plans?payment=pending`;

  const preferencePayload = {
    items: [{
      title:      PLAN_CATALOG[planSlug]?.displayName ?? planSlug,
      quantity:   1,
      unit_price: finalAmount,
      currency_id: 'CLP',
    }],
    back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
    auto_return: 'approved' as const,
    external_reference: externalReference,
    ...(notificationUrl && { notification_url: notificationUrl }),
  };

  const mpRes  = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mpAccessToken}` },
    body: JSON.stringify(preferencePayload),
  });

  const mpBody = await mpRes.text();
  if (!mpRes.ok) {
    console.error('[create-mp-preference] MP API error:', mpRes.status, mpBody.slice(0, 300));
    // Marcar pago como cancelado si MP falla
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    let errPayload: Record<string, unknown>;
    try { errPayload = { error: 'Mercado Pago preference creation failed', mp_response: JSON.parse(mpBody) }; }
    catch { errPayload = { error: 'Mercado Pago preference creation failed', mp_response: mpBody }; }
    return jsonResponse(errPayload, 500);
  }

  let preference: { id?: string; init_point?: string; sandbox_init_point?: string };
  try { preference = JSON.parse(mpBody); }
  catch {
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    return jsonResponse({ error: 'Invalid Mercado Pago response' }, 500);
  }

  const initPoint = preference?.init_point || preference?.sandbox_init_point;
  if (!initPoint) {
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    return jsonResponse({ error: 'Mercado Pago response missing init_point' }, 500);
  }

  // ── 6. Guardar preference_id y respuesta cruda en wa_payments ─────────────
  await adminClient.from('wa_payments').update({
    mp_preference_id: preference?.id ?? null,
    raw_mp_response:  preference as Record<string, unknown>,
  }).eq('id', paymentId);

  const isSandbox = !!preference?.sandbox_init_point;
  console.log('[create-mp-preference] preference_created', {
    planSlug,
    planLabel:    PLAN_CATALOG[planSlug]?.displayName,
    businessId:   business.id,
    paymentId,
    preferenceId: preference?.id,
    sandbox:      isSandbox,
  });

  return jsonResponse({ init_point: initPoint, payment_id: paymentId }, 200);
});
