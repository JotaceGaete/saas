// create-dlocal-checkout — crea sesión de pago en dLocal Go (redirect).
// Seguridad: business resuelto por auth.uid(). No acepta businessId del frontend.
// Persiste wa_payments (pending, provider = dlocal_go) antes de llamar a dLocal.
// La activación del plan solo ocurre vía webhook dlocal-webhook.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLAN_ORDER: Record<string, number> = { starter: 0, control: 1, pro: 2, business: 3 };
type PlanCatalog = Record<string, { displayName: string; price: number; durationDays: number }>;

const PLAN_CATALOG_CL: PlanCatalog = {
  starter:  { displayName: 'Starter',  price: 0,     durationDays: 30 },
  control:  { displayName: 'Plan Control', price: 500,  durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 5000, durationDays: 30 },
  business: { displayName: 'Plan Business', price: 10000, durationDays: 30 },
};

const PLAN_CATALOG_AR: PlanCatalog = {
  starter:  { displayName: 'Starter',  price: 0,     durationDays: 30 },
  control:  { displayName: 'Plan Control', price: 500,  durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 15000, durationDays: 30 },
  business: { displayName: 'Plan Business', price: 30000, durationDays: 30 },
};

function getPlanCatalog(country: string | undefined): PlanCatalog {
  return country === 'AR' ? PLAN_CATALOG_AR : PLAN_CATALOG_CL;
}

function normalizeCountryCode(value: string | undefined): string {
  const code = (value ?? '').toUpperCase().trim();
  if (!code) return 'CL';
  if (['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY'].includes(code)) {
    return code;
  }
  return 'CL';
}

/** Moneda ISO 4217 por país para dLocal Go. */
const CURRENCY_BY_COUNTRY: Record<string, string> = {
  AR: 'ARS',
  BO: 'BOB',
  BR: 'BRL',
  CL: 'CLP',
  CO: 'COP',
  CR: 'CRC',
  EC: 'USD',
  GT: 'GTQ',
  MX: 'MXN',
  PA: 'USD',
  PE: 'PEN',
  PY: 'PYG',
  UY: 'UYU',
};

function getCurrencyForCountry(countryCode: string): string {
  const code = (countryCode ?? '').toUpperCase().trim();
  return CURRENCY_BY_COUNTRY[code] ?? 'CLP';
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

const MS_PER_DAY = 24 * 60 * 60 * 1000;
type ChangeType = 'upgrade' | 'renewal' | 'downgrade';

function computePlanChange(
  currentPlanSlug: string,
  planExpiresAt: string | null,
  targetPlanSlug: string,
  catalog: PlanCatalog,
): { changeType: ChangeType; finalAmount: number; effectiveAt?: string; scheduledChange?: { targetPlanSlug: string; effectiveAt: string } } {
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

  let creditAmount = 0;
  if (changeType === 'upgrade' && currentPlanPrice > 0) {
    const rawCredit = (currentPlanPrice / 30) * remainingDaysFraction;
    creditAmount = Math.min(Math.floor(rawCredit), currentPlanPrice);
  }

  let finalAmount = targetPlanPrice;
  if (changeType === 'upgrade') finalAmount = Math.max(0, Math.floor(targetPlanPrice - creditAmount));
  else if (changeType === 'downgrade') finalAmount = 0;

  let effectiveAt: string | undefined;
  let scheduledChange: { targetPlanSlug: string; effectiveAt: string } | undefined;
  if (changeType === 'downgrade' && planExpiresAt) {
    effectiveAt = new Date(planExpiresAt).toISOString();
    scheduledChange = { targetPlanSlug, effectiveAt };
  } else if (changeType === 'renewal' || changeType === 'upgrade') {
    effectiveAt = planExpiresAt && new Date(planExpiresAt).getTime() > now
      ? planExpiresAt
      : new Date(now).toISOString();
  }

  return { changeType, finalAmount, effectiveAt, scheduledChange };
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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const apiKey = Deno.env.get('DLOCAL_GO_API_KEY') ?? '';
  const secretKey = Deno.env.get('DLOCAL_GO_SECRET_KEY') ?? '';
  const baseUrl = (Deno.env.get('DLOCAL_GO_BASE_URL') ?? 'https://api-sbx.dlocalgo.com').replace(/\/$/, '');
  const webhookUrl = Deno.env.get('DLOCAL_GO_WEBHOOK_URL') ?? '';
  console.log('DLOCAL_BASE_URL:', baseUrl);
  console.log('DLOCAL_API_KEY:', apiKey?.slice(0, 5));

  if (!serviceRoleKey) return jsonResponse({ error: 'Server configuration error' }, 500);
  if (!apiKey || !secretKey) return jsonResponse({ error: 'dLocal Go not configured' }, 500);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) return jsonResponse({ error: 'User not authenticated' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const planSlug = body?.planSlug as string | undefined;
  const fallbackCountry = normalizeCountryCode((body?.country as string | undefined) ?? 'CL');

  if (!planSlug || !PLAN_ORDER[planSlug]) return jsonResponse({ error: 'Plan no válido' }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('*')
    .eq('user_id', user.id);

  if (bizError || !businesses?.length) return jsonResponse({ error: 'Business not found for user' }, 404);
  if (businesses.length > 1) return jsonResponse({ error: 'Multiple businesses found' }, 409);

  const business = businesses[0];
  if (business.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);

  const countryCode = resolveBusinessCountryCode(
    business as { country_code?: string | null; country?: string | null; currency?: string | null },
    fallbackCountry,
  );
  if (countryCode === 'CL') {
    return jsonResponse({ error: 'En Chile los pagos se procesan con Mercado Pago', country_code: countryCode }, 400);
  }
  const catalog = getPlanCatalog(countryCode);
  const currencyId = getCurrencyForCountry(countryCode);

  const currentPlanSlug = (business as { plan_slug?: string }).plan_slug ?? 'starter';
  const planExpiresAt = (business as { plan_expires_at?: string | null }).plan_expires_at ?? null;
  const planChange = computePlanChange(currentPlanSlug, planExpiresAt, planSlug, catalog);

  if (planChange.changeType === 'downgrade') {
    const effectiveAt = planExpiresAt ?? new Date().toISOString();
    await adminClient.from('wa_businesses').update({
      scheduled_plan_slug: planSlug,
      scheduled_change_at: effectiveAt,
    }).eq('id', business.id);
    return jsonResponse({
      error: 'Downgrade no requiere pago',
      changeType: 'downgrade',
      message: 'El cambio a un plan inferior se aplicará al vencer tu plan actual.',
      scheduledChange: { targetPlanSlug: planSlug, effectiveAt },
    }, 400);
  }

  if (planChange.finalAmount === 0) {
    const effectiveAtMs = planChange.effectiveAt ? new Date(planChange.effectiveAt).getTime() : Date.now();
    const newExpiresAt = new Date(effectiveAtMs + 30 * MS_PER_DAY).toISOString();
    await adminClient.from('wa_businesses').update({
      plan_slug: planSlug,
      plan_expires_at: newExpiresAt,
    }).eq('id', business.id);
    const { data: internalPayment } = await adminClient.from('wa_payments').insert({
      business_id: business.id,
      user_id: user.id,
      plan_slug: planSlug,
      amount: 0,
      currency: currencyId,
      status: 'approved',
      provider: 'internal_proration',
      external_reference: 'internal_proration',
      metadata: { provider: 'internal_proration', changeType: planChange.changeType },
      plan_activated_at: new Date().toISOString(),
      plan_expires_at: newExpiresAt,
    }).select('id').single();
    return jsonResponse({
      applied: true,
      planSlug,
      plan_expires_at: newExpiresAt,
      payment_id: internalPayment?.id,
    }, 200);
  }

  const { data: paymentRow, error: paymentInsertError } = await adminClient
    .from('wa_payments')
    .insert({
      business_id: business.id,
      user_id: user.id,
      plan_slug: planSlug,
      amount: planChange.finalAmount,
      currency: currencyId,
      status: 'pending',
      provider: 'dlocal_go',
      external_reference: 'pending',
      metadata: {
        changeType: planChange.changeType,
        currentPlanSlug,
        targetPlanSlug: planSlug,
        effectiveAt: planChange.effectiveAt ?? null,
        reference_id: `${user.id}_${planSlug}`,
      },
    })
    .select('id')
    .single();

  if (paymentInsertError || !paymentRow?.id) {
    return jsonResponse({ error: 'No se pudo registrar el intento de pago' }, 500);
  }

  const paymentId = paymentRow.id;
  const externalReference = `waP:${paymentId}:${business.id}:${planSlug}`;
  await adminClient.from('wa_payments').update({ external_reference: externalReference }).eq('id', paymentId);

  // success_url y back_url deben venir del frontend con el origin actual (ar./cl.ventalink.app) para no cambiar de país al volver
  const successUrl = (body?.success_url as string) || '';
  const cancelUrl = (body?.cancel_url as string) || '';

  const amountForDlocal = Math.round(planChange.finalAmount);

  console.log('[dlocal-version] amount-mode=main-unit (no multiplication, value sent as-is)');
  console.log('[dlocal-audit] EXACT amount sent to dLocal:', amountForDlocal, '| planChange.finalAmount:', planChange.finalAmount);

  const payerName = (user.user_metadata?.full_name as string) || (user.email ?? 'Usuario').split('@')[0];
  const rawDocument = (user.user_metadata?.document as string)?.trim() || '';

  const payer: { name: string; email: string; document?: string } = {
    name: payerName.slice(0, 100),
    email: (user.email ?? `user-${user.id}@placeholder.local`).slice(0, 100),
  };
  if (rawDocument) payer.document = String(rawDocument).slice(0, 30);

  const dlocalPayload = {
    amount: amountForDlocal,
    currency: currencyId,
    payment_method_flow: 'REDIRECT',
    payment_method_id: 'CARD',
    country: countryCode,
    payer,
    order_id: String(paymentId),
    ...(webhookUrl && { notification_url: webhookUrl }),
    ...(successUrl && { success_url: successUrl }),
    ...(cancelUrl && { back_url: cancelUrl }),
  };

  console.log('[dlocal-payload] planChange.finalAmount:', planChange.finalAmount);
  console.log('[dlocal-payload] amountForDlocal:', amountForDlocal);
  console.log('[dlocal-payload] currencyId:', currencyId);
  console.log('[dlocal-payload] countryCode:', countryCode);
  console.log('[dlocal-payload] dlocalPayload:', JSON.stringify(dlocalPayload));

  const credentials = btoa(`${apiKey}:${secretKey}`);
  console.log('Calling dLocal with baseUrl:', baseUrl);
  const dlocalRes = await fetch(`${baseUrl}/v1/payments`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${credentials}`,
    },
    body: JSON.stringify(dlocalPayload),
  });

  const dlocalBody = await dlocalRes.text();

  console.log('[dlocal-response] status:', dlocalRes.status, 'bodyLength:', dlocalBody?.length);
  console.log('[dlocal-response] rawBody (full for audit):', dlocalBody ?? '(empty)');

  if (!dlocalRes.ok) {
    console.log('[dlocal-checkout] CANCELLED_REASON: dLocal devolvió error HTTP', dlocalRes.status, 'paymentId:', paymentId);
    const { data: currentRowErr } = await adminClient.from('wa_payments').select('metadata').eq('id', paymentId).single();
    const errMetadata = { ...((currentRowErr?.metadata as Record<string, unknown>) || {}), raw_dlocal_error_response: dlocalBody?.slice(0, 2000) ?? null };
    await adminClient.from('wa_payments').update({ status: 'cancelled', metadata: errMetadata }).eq('id', paymentId);
    let errPayload: Record<string, unknown>;
    try {
      errPayload = { error: 'dLocal Go error', detail: JSON.parse(dlocalBody) };
    } catch {
      errPayload = { error: 'dLocal Go error', detail: dlocalBody.slice(0, 300) };
    }
    return jsonResponse(errPayload, 502);
  }

  let dlocalPayment: { id?: string; redirect_url?: string; status?: string };
  try {
    dlocalPayment = JSON.parse(dlocalBody);
  } catch {
    console.log('[dlocal-checkout] CANCELLED_REASON: error de parseo de respuesta JSON, paymentId:', paymentId);
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    return jsonResponse({ error: 'Invalid dLocal Go response' }, 502);
  }

  const redirectUrl = dlocalPayment?.redirect_url;
  const providerPaymentId = dlocalPayment?.id ? String(dlocalPayment.id) : null;

  if (!redirectUrl) {
    console.log('[dlocal-checkout] CANCELLED_REASON: dLocal no devolvió redirect_url, paymentId:', paymentId);
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    return jsonResponse({ error: 'dLocal Go no devolvió URL de pago' }, 502);
  }

  console.log('[dlocal-response] parsed:', JSON.stringify(dlocalPayment));

  const { data: currentRow } = await adminClient.from('wa_payments').select('metadata').eq('id', paymentId).single();
  const mergedMetadata = { ...((currentRow?.metadata as Record<string, unknown>) || {}), raw_dlocal_response: dlocalPayment };
  await adminClient.from('wa_payments').update({
    provider_payment_id: providerPaymentId,
    metadata: mergedMetadata,
  }).eq('id', paymentId);

  console.log('[dlocal-audit] payment row updated | paymentId (wa_payments.id):', paymentId, '| provider_payment_id:', providerPaymentId);

  return jsonResponse({ redirect_url: redirectUrl, payment_id: paymentId }, 200);
});
