// plan-change-preview — preview de cambio de plan.
// Requiere JWT. Business resuelto por auth.uid().
// Chile: Mercado Pago → catálogo CLP (prorrateo).
// Resto (INT): catálogo USD (PayPal/dLocal/manual según provider).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  VALID_PLAN_SLUGS,
  getPlanCatalog,
  resolveBusinessCountryCode,
  computePlanChange,
  buildIntlUsdPreview,
  applyTrialOverride,
  normalizeBillingPeriod,
  type PlanChangeResult,
} from './lib.ts';

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
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    return jsonResponse({ error: 'User not authenticated' }, 401);
  }

  let targetPlanSlug: string | undefined;
  let providerHint: string | undefined;
  let billingPeriod: 'monthly' | 'annual' = 'monthly';
  if (req.method === 'GET') {
    const url = new URL(req.url);
    targetPlanSlug = url.searchParams.get('targetPlanSlug') ?? undefined;
    providerHint = url.searchParams.get('provider') ?? undefined;
    billingPeriod = normalizeBillingPeriod(url.searchParams.get('billingPeriod') ?? undefined);
  } else {
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      targetPlanSlug = body?.targetPlanSlug as string | undefined;
      providerHint = body?.provider as string | undefined;
      billingPeriod = normalizeBillingPeriod(body?.billingPeriod as string | undefined);
    } catch {
      targetPlanSlug = undefined;
    }
  }

  if (!targetPlanSlug || !VALID_PLAN_SLUGS.includes(targetPlanSlug)) {
    console.log('[plan-change-preview] 400: targetPlanSlug inválido o faltante', { targetPlanSlug });
    return jsonResponse({ error: 'targetPlanSlug inválido o faltante' }, 400);
  }

  if (!serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: biz, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (bizError || !biz) {
    console.log('[plan-change-preview] 404: business not found', { userId: user.id, error: bizError?.message });
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }
  if (biz.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const rawPlan = (biz as { plan_slug?: string }).plan_slug ?? 'starter';
  const currentPlanSlug = rawPlan === 'control' ? 'starter' : rawPlan;
  const planExpiresAt = (biz as { plan_expires_at?: string | null }).plan_expires_at ?? null;
  const trialExpiresAt = (biz as { trial_expires_at?: string | null }).trial_expires_at ?? null;
  const scheduledPlanSlug = (biz as { scheduled_plan_slug?: string | null }).scheduled_plan_slug ?? null;
  const now = Date.now();
  const trialExpiresMs = trialExpiresAt ? new Date(trialExpiresAt).getTime() : NaN;
  const activePeriodEnd = Number.isFinite(trialExpiresMs) && trialExpiresMs > now
    ? trialExpiresAt
    : planExpiresAt;
  const countryCode = resolveBusinessCountryCode(
    biz as { country_code?: string | null; country?: string | null; currency?: string | null },
  );

  // Fuera de CL/AR: precios estáticos 6/10 USD de referencia. Sin prorrateo.
  const normalizedProvider = String(providerHint || '').trim().toLowerCase();
  const useIntlUsdProviders = new Set(['paypal', 'dlocal_go', 'dlocal', 'manual', 'lemonsqueezy']);
  const useIntlUsd =
    useIntlUsdProviders.has(normalizedProvider) ||
    (countryCode && countryCode !== 'CL' && countryCode !== 'AR');
  let preview: PlanChangeResult;

  if (billingPeriod === 'annual' && useIntlUsd) {
    return jsonResponse({
      error: 'Pago anual disponible por ahora con Mercado Pago en Chile y Argentina.',
      billingPeriod,
    }, 400);
  }

  if (useIntlUsd) {
    preview = buildIntlUsdPreview(currentPlanSlug, targetPlanSlug, activePeriodEnd, trialExpiresAt, scheduledPlanSlug);
  } else {
    const catalog = getPlanCatalog(countryCode, providerHint, billingPeriod);
    if (!catalog) {
      preview = buildIntlUsdPreview(currentPlanSlug, targetPlanSlug, activePeriodEnd, trialExpiresAt, scheduledPlanSlug);
    } else {
      preview = computePlanChange(currentPlanSlug, activePeriodEnd, targetPlanSlug, catalog, billingPeriod);
    }
  }

  // FIX-2: trial override unificado — aplica para CL, AR e INTL en un solo lugar.
  preview = applyTrialOverride(preview, trialExpiresAt);

  if (preview.blocked || preview.blockReason === 'active_downgrade_blocked') {
    return jsonResponse({
      ...preview,
      ok: false,
      code: 'ACTIVE_DOWNGRADE_BLOCKED',
    }, 409);
  }

  console.log('[plan-change-preview]', {
    currentPlanSlug,
    targetPlanSlug,
    changeType: preview.changeType,
    useIntlUsd,
    billingPeriod,
    finalAmount: preview.finalAmount,
  });

  return jsonResponse(preview, 200);
});
