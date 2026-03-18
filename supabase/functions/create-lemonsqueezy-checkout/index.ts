// create-lemonsqueezy-checkout — crea checkout en LemonSqueezy y devuelve URL.
// Solo para países fuera de Chile (Chile usa Mercado Pago).
// Seguridad: business resuelto por SERVICE_ROLE + auth.uid(). No acepta businessId del frontend.
// Persiste wa_payments (pending, provider=lemonsqueezy) antes de llamar a LemonSqueezy API.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VALID_PLAN_SLUGS = ['starter', 'pro', 'business'];
const PLAN_ORDER: Record<string, number> = { starter: 0, control: 0, pro: 1, business: 2 };
type PlanCatalog = Record<string, { displayName: string; price: number; durationDays: number }>;

const PLAN_CATALOG_USD: PlanCatalog = {
  starter:  { displayName: 'Starter',  price: 0,   durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 15,  durationDays: 30 },
  business: { displayName: 'Plan Full', price: 30, durationDays: 30 },
};

function normalizeCountryCode(value: string | undefined): string {
  const code = (value ?? '').toUpperCase().trim();
  if (!code) return 'CL';
  if (['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY'].includes(code)) return code;
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
    ARGENTINA: 'AR', CHILE: 'CL', BOLIVIA: 'BO', BRASIL: 'BR', BRAZIL: 'BR',
    COLOMBIA: 'CO', 'COSTA RICA': 'CR', ECUADOR: 'EC', GUATEMALA: 'GT',
    MEXICO: 'MX', PANAMA: 'PA', PERU: 'PE', PARAGUAY: 'PY', URUGUAY: 'UY',
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
  catalog: PlanCatalog = PLAN_CATALOG_USD,
): {
  changeType: ChangeType;
  finalAmount: number;
  daysRemaining: number;
  creditAmount: number;
  currentPlanPrice: number;
  targetPlanPrice: number;
  effectiveAt?: string;
  scheduledChange?: { targetPlanSlug: string; effectiveAt: string };
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
    effectiveAt = planExpiresAt && new Date(planExpiresAt).getTime() > now ? planExpiresAt : new Date(now).toISOString();
  }
  return { changeType, finalAmount, daysRemaining, creditAmount, currentPlanPrice, targetPlanPrice, effectiveAt, scheduledChange };
}

/**
 * Mapea variant_id de LemonSqueezy a plan_slug interno.
 */
function mapVariantToPlan(variantId: string | number): string | null {
  const v = String(variantId).trim();
  const proId = Deno.env.get('LEMONSQUEEZY_VARIANT_PRO_ID') ?? '';
  const businessId = Deno.env.get('LEMONSQUEEZY_VARIANT_BUSINESS_ID') ?? '';
  if (v === proId) return 'pro';
  if (v === businessId) return 'business';
  return null;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const apiKey = Deno.env.get('LEMONSQUEEZY_API_KEY') ?? '';
  const storeId = Deno.env.get('LEMONSQUEEZY_STORE_ID') ?? '';
  const variantProId = Deno.env.get('LEMONSQUEEZY_VARIANT_PRO_ID') ?? '';
  const variantBusinessId = Deno.env.get('LEMONSQUEEZY_VARIANT_BUSINESS_ID') ?? '';

  if (!serviceRoleKey) {
    console.error('[create-lemonsqueezy-checkout] SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  if (!apiKey || !storeId || !variantProId || !variantBusinessId) {
    console.error('[create-lemonsqueezy-checkout] LEMONSQUEEZY_API_KEY, STORE_ID o VARIANT IDs no configurados');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }

  let body: Record<string, unknown>;
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { body = {}; }

  const planSlug = body?.planSlug as string | undefined;
  const successUrl = (body?.success_url as string) ?? '';
  const cancelUrl = (body?.cancel_url as string) ?? '';
  const fallbackCountry = normalizeCountryCode((body?.country as string | undefined) ?? '');

  if (!planSlug || !VALID_PLAN_SLUGS.includes(planSlug)) {
    return jsonResponse({ error: 'Plan no válido' }, 400);
  }
  if (planSlug === 'starter') {
    return jsonResponse({ error: 'El plan Starter es gratuito' }, 400);
  }

  const variantIdMap: Record<string, string> = { pro: variantProId, business: variantBusinessId };
  const variantId = variantIdMap[planSlug];
  if (!variantId) {
    return jsonResponse({ error: 'Variant no configurado para este plan' }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('*')
    .eq('user_id', user.id);

  if (bizError || !businesses?.length) {
    return jsonResponse({ error: 'Business not found for user', reason: 'no_business' }, 404);
  }
  if (businesses.length > 1) {
    return jsonResponse({ error: 'Multiple businesses found', reason: 'multiple_businesses', count: businesses.length }, 409);
  }

  const business = businesses[0];
  if (business.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden', reason: 'ownership_mismatch' }, 403);
  }

  const resolvedFromBiz = resolveBusinessCountryCode(
    business as { country_code?: string | null; country?: string | null; currency?: string | null },
    fallbackCountry || undefined,
  );
  // Si el frontend envía country no-CL (usuario en ar/go.ventalink.app), permitir LemonSqueezy.
  const countryCode = fallbackCountry && fallbackCountry !== 'CL' ? fallbackCountry : resolvedFromBiz;
  if (countryCode === 'CL') {
    return jsonResponse({ error: 'Para Chile usa Mercado Pago. Accede desde cl.ventalink.app.', country_code: countryCode }, 400);
  }

  const catalog = PLAN_CATALOG_USD;
  const rawPlan = (business as { plan_slug?: string }).plan_slug ?? 'starter';
  const currentPlanSlug = rawPlan === 'control' ? 'starter' : rawPlan;
  const planExpiresAt = (business as { plan_expires_at?: string | null }).plan_expires_at ?? null;
  const trialExpiresAt = (business as { trial_expires_at?: string | null }).trial_expires_at ?? null;
  const scheduledPlanSlug = (business as { scheduled_plan_slug?: string | null }).scheduled_plan_slug ?? null;
  let planChange = computePlanChange(currentPlanSlug, planExpiresAt, planSlug, catalog);

  const now = Date.now();
  const isActiveProTrial =
    currentPlanSlug === 'pro' && trialExpiresAt && new Date(trialExpiresAt).getTime() > now && scheduledPlanSlug === 'starter';
  if (isActiveProTrial && planSlug === 'pro' && trialExpiresAt) {
    planChange = { ...planChange, effectiveAt: trialExpiresAt, scheduledChange: { targetPlanSlug: planSlug, effectiveAt: trialExpiresAt } };
  }

  if (planChange.changeType === 'downgrade') {
    const effectiveAt = planExpiresAt ?? new Date().toISOString();
    await adminClient.from('wa_businesses').update({ scheduled_plan_slug: planSlug, scheduled_change_at: effectiveAt }).eq('id', business.id);
    return jsonResponse({
      error: 'Downgrade no requiere pago',
      changeType: 'downgrade',
      message: 'El cambio a un plan inferior se aplicará al vencer tu plan actual.',
      scheduledChange: { targetPlanSlug: planSlug, effectiveAt },
    }, 400);
  }

  const finalAmount = planChange.finalAmount;
  const isScheduledTrialConversion = isActiveProTrial && planSlug === 'pro' && trialExpiresAt && new Date(trialExpiresAt).getTime() > now;
  const metadata: Record<string, unknown> = {
    currentPlanSlug,
    targetPlanSlug: planSlug,
    finalAmount,
    changeType: planChange.changeType,
    effectiveAt: planChange.effectiveAt ?? null,
    scheduledChange: planChange.scheduledChange ?? null,
    provider: 'lemonsqueezy',
  };
  if (isScheduledTrialConversion && trialExpiresAt) {
    metadata.isScheduledTrialConversion = true;
    metadata.effectiveAt = trialExpiresAt;
  }

  if (finalAmount === 0) {
    const effectiveAtMs = planChange.effectiveAt ? new Date(planChange.effectiveAt).getTime() : Date.now();
    const newExpiresAt = new Date(effectiveAtMs + 30 * MS_PER_DAY).toISOString();
    const { error: bizUpdateErr } = await adminClient.from('wa_businesses').update({ plan_slug: planSlug, plan_expires_at: newExpiresAt }).eq('id', business.id);
    if (bizUpdateErr) return jsonResponse({ error: 'No se pudo aplicar el cambio de plan' }, 500);
    const { data: internalPayment, error: paymentInsertError } = await adminClient
      .from('wa_payments')
      .insert({
        business_id: business.id,
        user_id: user.id,
        plan_slug: planSlug,
        amount: 0,
        currency: 'USD',
        status: 'approved',
        provider: 'internal_proration',
        external_reference: 'internal_proration',
        metadata: { ...metadata, provider: 'internal_proration' },
        plan_activated_at: new Date().toISOString(),
        plan_expires_at: newExpiresAt,
      })
      .select('id')
      .single();
    if (paymentInsertError || !internalPayment?.id) return jsonResponse({ error: 'No se pudo registrar el pago interno' }, 500);
    return jsonResponse({ applied: true, planSlug, plan_expires_at: newExpiresAt, payment_id: internalPayment.id }, 200);
  }

  const { data: paymentRow, error: paymentInsertError } = await adminClient
    .from('wa_payments')
    .insert({
      business_id: business.id,
      user_id: user.id,
      plan_slug: planSlug,
      amount: finalAmount,
      currency: 'USD',
      status: 'pending',
      provider: 'lemonsqueezy',
      external_reference: 'pending',
      metadata,
    })
    .select('id')
    .single();

  if (paymentInsertError || !paymentRow?.id) {
    console.error('[create-lemonsqueezy-checkout] error al crear wa_payments:', paymentInsertError?.message);
    return jsonResponse({ error: 'No se pudo registrar el intento de pago' }, 500);
  }

  const paymentId = paymentRow.id;
  await adminClient.from('wa_payments').update({ external_reference: `waP:${paymentId}:${business.id}:${planSlug}` }).eq('id', paymentId);

  const baseSuccessUrl = successUrl || 'https://go.ventalink.app/billing/success';
  const baseCancelUrl = cancelUrl || 'https://go.ventalink.app/billing/cancel';

  const checkoutPayload = {
    data: {
      type: 'checkouts',
      attributes: {
        product_options: {
          enabled_variants: [parseInt(variantId, 10)],
          redirect_url: baseSuccessUrl,
        },
        checkout_options: { skip_trial: true },
        checkout_data: {
          custom: { payment_id: paymentId, business_id: business.id, user_id: user.id },
          email: (user.email ?? '').trim() || undefined,
        },
      },
      relationships: {
        store: { data: { type: 'stores', id: storeId } },
        variant: { data: { type: 'variants', id: variantId } },
      },
    },
  };

  if (finalAmount > 0) {
    (checkoutPayload.data.attributes as Record<string, unknown>).custom_price = Math.round(finalAmount * 100);
  }

  const lsRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(checkoutPayload),
  });

  const lsBody = await lsRes.text();
  if (!lsRes.ok) {
    console.error('[create-lemonsqueezy-checkout] LemonSqueezy API error:', lsRes.status, lsBody.slice(0, 500));
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    let errPayload: Record<string, unknown>;
    try { errPayload = { error: 'LemonSqueezy checkout creation failed', response: JSON.parse(lsBody) }; } catch { errPayload = { error: 'LemonSqueezy checkout creation failed', response: lsBody }; }
    return jsonResponse(errPayload, 500);
  }

  let parsed: { data?: { attributes?: { url?: string }; id?: string } };
  try { parsed = JSON.parse(lsBody); } catch {
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    return jsonResponse({ error: 'Invalid LemonSqueezy response' }, 500);
  }

  const checkoutUrl = parsed?.data?.attributes?.url;
  if (!checkoutUrl) {
    await adminClient.from('wa_payments').update({ status: 'cancelled' }).eq('id', paymentId);
    return jsonResponse({ error: 'LemonSqueezy response missing checkout URL' }, 500);
  }

  await adminClient.from('wa_payments').update({
    provider_payment_id: parsed?.data?.id ?? null,
    raw_mp_response: parsed?.data as Record<string, unknown>,
  }).eq('id', paymentId);

  console.log('[create-lemonsqueezy-checkout] checkout_created', { planSlug, businessId: business.id, paymentId });

  return jsonResponse({ redirect_url: checkoutUrl, payment_id: paymentId }, 200);
});
