// create-mp-preference — crea preferencia de pago en Mercado Pago.
// Seguridad: business resuelto 100% por SERVICE_ROLE + auth.uid(). No acepta businessId del frontend.
// Persiste wa_payments (pending) antes de llamar a MP. Idempotencia garantizada por wa_payments.id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Planes válidos actuales; legacy 'control' mapeado a starter para prorrateo.
const VALID_PLAN_SLUGS = ['starter', 'pro', 'business'];
const PLAN_ORDER: Record<string, number> = { starter: 0, control: 0, pro: 1, business: 2 };
type PlanCatalog = Record<string, { displayName: string; price: number; durationDays: number }>;

const PLAN_CATALOG_CL: PlanCatalog = {
  starter:  { displayName: 'Starter',  price: 0,     durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 5990,  durationDays: 30 },
  business: { displayName: 'Plan Full', price: 9990, durationDays: 30 },
};

const PLAN_CATALOG_AR: PlanCatalog = {
  starter:  { displayName: 'Starter',       price: 0,     durationDays: 30 },
  pro:      { displayName: 'Plan Pro',      price: 8990,  durationDays: 30 },
  business: { displayName: 'Plan Business', price: 13990, durationDays: 30 },
};

// Catálogos anuales: precio = total anual (equiv_mensual × 12), duración = 365 días.
const PLAN_CATALOG_CL_ANNUAL: PlanCatalog = {
  starter:  { displayName: 'Starter',         price: 0,     durationDays: 365 },
  pro:      { displayName: 'Plan Pro Anual',  price: 59880, durationDays: 365 }, // 4990 × 12
  business: { displayName: 'Plan Full Anual', price: 99600, durationDays: 365 }, // 8300 × 12
};

const PLAN_CATALOG_AR_ANNUAL: PlanCatalog = {
  starter:  { displayName: 'Starter',         price: 0,      durationDays: 365 },
  pro:      { displayName: 'Plan Pro Anual',  price: 89880,  durationDays: 365 }, // 7490 × 12
  business: { displayName: 'Plan Full Anual', price: 139800, durationDays: 365 }, // 11650 × 12
};

function getPlanCatalog(country: string | undefined, billingCycle?: string): PlanCatalog {
  const isAnnual = billingCycle === 'annual';
  if (country === 'AR') return isAnnual ? PLAN_CATALOG_AR_ANNUAL : PLAN_CATALOG_AR;
  return isAnnual ? PLAN_CATALOG_CL_ANNUAL : PLAN_CATALOG_CL;
}

function normalizeCountryCode(value: string | undefined): string {
  const code = (value ?? '').toUpperCase().trim();
  if (!code) return 'CL';
  if (['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY'].includes(code)) {
    return code;
  }
  return 'CL';
}

function resolveBusinessCountryCode(
  business: { country_code?: string | null; country?: string | null; currency?: string | null },
  fallbackCountry?: string,
): string {
  const direct = normalizeCountryCode(business.country_code ?? undefined);
  if (business.country_code) return direct;

  const countryRaw = (business.country ?? '').toUpperCase().trim();
  const countryAliases: Record<string, string> = {
    ARGENTINA: 'AR',
    CHILE: 'CL',
    BOLIVIA: 'BO',
    BRASIL: 'BR',
    BRAZIL: 'BR',
    COLOMBIA: 'CO',
    'COSTA RICA': 'CR',
    ECUADOR: 'EC',
    GUATEMALA: 'GT',
    MEXICO: 'MX',
    PANAMA: 'PA',
    PERU: 'PE',
    PARAGUAY: 'PY',
    URUGUAY: 'UY',
  };
  if (countryRaw && countryAliases[countryRaw]) return countryAliases[countryRaw];
  if (countryRaw) return normalizeCountryCode(countryRaw);

  const currency = (business.currency ?? '').toUpperCase().trim();
  if (currency === 'ARS') return 'AR';
  if (currency === 'CLP') return 'CL';

  return normalizeCountryCode(fallbackCountry);
}

const PRORATION_FORMULA_VERSION = '2024-03-exact-time';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ChangeType = 'upgrade' | 'renewal' | 'downgrade';

function computePlanChange(
  currentPlanSlug: string,
  planExpiresAt: string | null,
  targetPlanSlug: string,
  catalog: PlanCatalog = PLAN_CATALOG_CL,
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
  const currentPlanPrice = catalog[currentPlanSlug]?.price ?? 0;
  const targetPlanPrice = catalog[targetPlanSlug]?.price ?? 0;

  let changeType: ChangeType = 'renewal';
  if (targetOrder > currentOrder) changeType = 'upgrade';
  else if (targetOrder < currentOrder) changeType = 'downgrade';

  let remainingMs = 0;
  if (planExpiresAt) {
    const exp = new Date(planExpiresAt).getTime();
    remainingMs = Math.max(0, exp - now);
  }
  const msPerPeriod = (catalog[currentPlanSlug]?.durationDays ?? 30) * MS_PER_DAY;
  const remainingDaysFraction = msPerPeriod > 0
    ? Math.min((remainingMs / msPerPeriod) * (catalog[currentPlanSlug]?.durationDays ?? 30), 30)
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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
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
  // Credenciales MP por país. Fallback a MP_ACCESS_TOKEN genérico para compatibilidad.
  const mpAccessTokenCl  = Deno.env.get('MP_ACCESS_TOKEN_CL') ?? Deno.env.get('MP_ACCESS_TOKEN') ?? '';
  const mpAccessTokenAr  = Deno.env.get('MP_ACCESS_TOKEN_AR') ?? Deno.env.get('MP_ACCESS_TOKEN') ?? '';
  // Fallback solo si el front no envía success_url (app en go.ventalink.app).
  const appBaseUrl    = (Deno.env.get('APP_BASE_URL') ?? 'https://go.ventalink.app').replace(/\/$/, '');
  const mpWebhookBase = Deno.env.get('MP_WEBHOOK_URL') ?? '';

  if (!serviceRoleKey) {
    console.error('[create-mp-preference] SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  if (!mpAccessTokenCl && !mpAccessTokenAr) {
    console.error('[create-mp-preference] No MP access token configured (MP_ACCESS_TOKEN_CL / MP_ACCESS_TOKEN_AR)');
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
  const billingCycle = (body?.billingCycle as string | undefined) === 'annual' ? 'annual' : 'monthly';
  const fallbackCountry = normalizeCountryCode((body?.country as string | undefined) ?? 'CL');
  const fallbackCatalog = getPlanCatalog(fallbackCountry, billingCycle);
  const fallbackCurrencyId = fallbackCountry === 'AR' ? 'ARS' : 'CLP';
  const price    = planSlug ? fallbackCatalog[planSlug]?.price : undefined;
  console.log('[create-mp-preference] planSlug:', planSlug ?? '(none)', '| billingCycle:', billingCycle, '| fallbackCountry:', fallbackCountry, '| fallbackCurrency:', fallbackCurrencyId, '| price:', price ?? '(inválido)');
  console.log('[create-mp-preference] received', { planSlug, billingCycle, rawBillingCycle: body?.billingCycle ?? '(not_sent)', fallbackCountry });
  if (!planSlug || !VALID_PLAN_SLUGS.includes(planSlug)) {
    return jsonResponse({ error: 'Plan no válido' }, 400);
  }

  // ── 3. Resolver negocio con SERVICE_ROLE (sin RLS, sin ambigüedad) ─────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('*')
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

  const countryCode = resolveBusinessCountryCode(
    business as { country_code?: string | null; country?: string | null; currency?: string | null },
    fallbackCountry,
  );
  if (countryCode !== 'CL' && countryCode !== 'AR') {
    return jsonResponse({ error: 'Mercado Pago solo está disponible para Chile y Argentina', country_code: countryCode }, 400);
  }
  // Seleccionar token según país — determina en qué dominio MP abre el checkout.
  const mpAccessToken = countryCode === 'AR' ? mpAccessTokenAr : mpAccessTokenCl;
  // Incluir país en notification_url para que mp-webhook use el token correcto sin fallback.
  const notificationUrl = mpWebhookBase
    ? `${mpWebhookBase}${mpWebhookBase.includes('?') ? '&' : '?'}country=${countryCode}`
    : '';
  if (!mpAccessToken) {
    console.error(`[create-mp-preference] MP_ACCESS_TOKEN_${countryCode} no configurado`);
    return jsonResponse({ error: 'Server configuration error', reason: `mp_token_missing_${countryCode.toLowerCase()}` }, 500);
  }
  const catalog = getPlanCatalog(countryCode, billingCycle);
  const currencyId = countryCode === 'AR' ? 'ARS' : 'CLP';

  // ── 4. Calcular tipo de cambio y monto final (prorrateo en upgrades) ───────
  const rawPlan = (business as { plan_slug?: string }).plan_slug ?? 'starter';
  const currentPlanSlug = rawPlan === 'control' ? 'starter' : rawPlan;
  const planExpiresAt   = (business as { plan_expires_at?: string | null }).plan_expires_at ?? null;
  const trialExpiresAt  = (business as { trial_expires_at?: string | null }).trial_expires_at ?? null;
  const scheduledPlanSlug = (business as { scheduled_plan_slug?: string | null }).scheduled_plan_slug ?? null;
  let planChange = computePlanChange(currentPlanSlug, planExpiresAt, planSlug, catalog);

  // Annual billing: skip month-to-month proration — always charge the full annual total.
  // computePlanChange uses annual catalog prices as if the current plan is also annual, which
  // produces wrong credit amounts for users actually on monthly plans.
  if (billingCycle === 'annual') {
    const annualTotalPrice = catalog[planSlug]?.price ?? 0;
    const currentOrd = PLAN_ORDER[currentPlanSlug] ?? 0;
    const targetOrd  = PLAN_ORDER[planSlug] ?? 0;
    const annualChangeType: ChangeType =
      targetOrd > currentOrd ? 'upgrade' : targetOrd < currentOrd ? 'downgrade' : 'renewal';
    planChange = {
      ...planChange,
      changeType:      annualChangeType,
      creditAmount:    0,
      daysRemaining:   0,
      targetPlanPrice: annualTotalPrice,
      finalAmount:     annualChangeType === 'downgrade' ? 0 : annualTotalPrice,
      effectiveAt:     new Date().toISOString(),
      scheduledChange: annualChangeType === 'downgrade'
        ? { targetPlanSlug: planSlug, effectiveAt: planExpiresAt ?? new Date().toISOString() }
        : undefined,
    };
  }

  // Si hay trial vigente: precio completo, sin crédito/prorrateo, plan programado al fin del trial.
  // Aplica a cualquier plan destino (pro, business), no solo pro→pro.
  const now = Date.now();
  const isActiveTrial =
    !!trialExpiresAt &&
    new Date(trialExpiresAt).getTime() > now;

  if (isActiveTrial && trialExpiresAt) {
    planChange = {
      ...planChange,
      creditAmount: 0,
      daysRemaining: 0,
      remainingDaysFraction: 0,
      finalAmount: planChange.targetPlanPrice,
      effectiveAt: trialExpiresAt,
      scheduledChange: { targetPlanSlug: planSlug, effectiveAt: trialExpiresAt },
    };
  }

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
  const isScheduledTrialConversion = isActiveTrial;
  const metadata: Record<string, unknown> = {
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
    billing_cycle:    billingCycle,
    interval_unit:    billingCycle === 'annual' ? 'year' : 'month',
    duration_days:    catalog[planSlug]?.durationDays ?? 30,
  };
  if (isScheduledTrialConversion && trialExpiresAt) {
    metadata.isScheduledTrialConversion = true;
    metadata.effectiveAt = trialExpiresAt;
  }
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
        currency:            currencyId,
        status:              'approved',
        provider:            'internal_proration',
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
      currency:           currencyId,
      status:             'pending',
      provider:           'mercado_pago',
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

  // ── 6. Crear preferencia en Mercado Pago ──────────────────────────────────
  const successUrl = (body?.success_url as string) || `${appBaseUrl}/plans?payment=success`;
  const failureUrl = (body?.failure_url as string) || `${appBaseUrl}/plans?payment=failure`;
  const pendingUrl = (body?.pending_url as string) || `${appBaseUrl}/plans?payment=pending`;

  console.log('[create-mp-preference] MP amount', {
    planSlug,
    billingCycle,
    countryCode,
    currencyId,
    catalogPrice: catalog[planSlug]?.price ?? null,
    finalAmount,
  });

  const preferencePayload = {
    items: [{
      title:      catalog[planSlug]?.displayName ?? planSlug,
      quantity:   1,
      unit_price: finalAmount,
      currency_id: currencyId,
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

  // ── 7. Guardar preference_id y respuesta cruda en wa_payments ─────────────
  await adminClient.from('wa_payments').update({
    mp_preference_id: preference?.id ?? null,
    raw_mp_response:  preference as Record<string, unknown>,
  }).eq('id', paymentId);

  const isSandbox = !!preference?.sandbox_init_point;
  console.log('[create-mp-preference] preference_created', {
    planSlug,
    planLabel:    catalog[planSlug]?.displayName,
    businessId:   business.id,
    paymentId,
    preferenceId: preference?.id,
    sandbox:      isSandbox,
  });

  return jsonResponse({ init_point: initPoint, payment_id: paymentId }, 200);
});
