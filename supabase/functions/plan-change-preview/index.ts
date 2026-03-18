// plan-change-preview — preview de cambio de plan.
// Requiere JWT. Business resuelto por auth.uid().
// Chile: Mercado Pago → catálogo CLP (prorrateo).
// Resto (Lemon): precios estáticos 6/10 USD, sin cálculos. Lemon es la fuente de verdad via variant_id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VALID_PLAN_SLUGS = ['starter', 'pro', 'business'];
const PLAN_ORDER: Record<string, number> = { starter: 0, control: 0, pro: 1, business: 2 };
type PlanCatalog = Record<string, { displayName: string; price: number; durationDays: number }>;

// Chile: Mercado Pago (CLP).
const PLAN_CATALOG_CL: PlanCatalog = {
  starter:  { displayName: 'Starter',  price: 0,     durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 5990, durationDays: 30 },
  business: { displayName: 'Plan Business', price: 10000, durationDays: 30 },
};

const PLAN_CATALOG_AR: PlanCatalog = {
  starter:  { displayName: 'Starter',  price: 0,     durationDays: 30 },
  pro:      { displayName: 'Plan Pro', price: 15000, durationDays: 30 },
  business: { displayName: 'Plan Business', price: 30000, durationDays: 30 },
};

/** Precios estáticos Lemon (USD). Pro=6, Full=10. Fuente de verdad: variant_id en Lemon. */
const LEMON_PRICES_USD: Record<string, number> = { starter: 0, pro: 6, business: 10 };

function getPlanCatalog(country: string | undefined, provider?: string): PlanCatalog | null {
  if (provider === 'lemonsqueezy') return null;
  if (country && country !== 'CL') return null;
  return country === 'AR' ? PLAN_CATALOG_AR : PLAN_CATALOG_CL;
}

function normalizeCountryCode(value: string | undefined): string {
  const code = (value ?? '').toUpperCase().trim();
  if (!code) return 'CL';
  if (['AR', 'BO', 'BR', 'CL', 'CO', 'CR', 'EC', 'GT', 'MX', 'PA', 'PE', 'PY', 'UY'].includes(code)) return code;
  return 'CL';
}

function resolveBusinessCountryCode(
  business: { country_code?: string | null; country?: string | null; currency?: string | null },
): string {
  if (business.country_code) return normalizeCountryCode(business.country_code ?? undefined);
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
  return 'CL';
}

const PRORATION_FORMULA_VERSION = '2024-03-exact-time';
const MS_PER_DAY = 24 * 60 * 60 * 1000;
type ChangeType = 'upgrade' | 'renewal' | 'downgrade';

function computePlanChange(
  currentPlanSlug: string,
  planExpiresAt: string | null,
  targetPlanSlug: string,
  catalog: PlanCatalog,
): {
  currentPlanSlug: string;
  currentPlanPrice: number;
  targetPlanSlug: string;
  targetPlanPrice: number;
  daysRemaining: number;
  remainingDaysFraction: number;
  creditAmount: number;
  finalAmount: number;
  changeType: ChangeType;
  message?: string;
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
  } else if (changeType === 'renewal') {
    finalAmount = targetPlanPrice;
  } else {
    finalAmount = 0;
  }

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

  const message = changeType === 'downgrade'
    ? 'El cambio a un plan inferior se aplicará al vencer tu plan actual. No se realiza ningún cargo.'
    : undefined;

  return {
    currentPlanSlug,
    currentPlanPrice,
    targetPlanSlug,
    targetPlanPrice,
    daysRemaining,
    remainingDaysFraction,
    creditAmount,
    finalAmount,
    changeType,
    message,
    effectiveAt,
    scheduledChange,
    prorationFormulaVersion: PRORATION_FORMULA_VERSION,
  };
}

function buildLemonPreview(
  currentPlanSlug: string,
  targetPlanSlug: string,
  planExpiresAt: string | null,
  trialExpiresAt: string | null,
  scheduledPlanSlug: string | null,
): {
  currentPlanSlug: string;
  currentPlanPrice: number;
  targetPlanSlug: string;
  targetPlanPrice: number;
  daysRemaining: number;
  remainingDaysFraction: number;
  creditAmount: number;
  finalAmount: number;
  changeType: ChangeType;
  message?: string;
  effectiveAt?: string;
  scheduledChange?: { targetPlanSlug: string; effectiveAt: string };
  prorationFormulaVersion: string;
} {
  const targetPrice = LEMON_PRICES_USD[targetPlanSlug] ?? 0;
  const currentPrice = LEMON_PRICES_USD[currentPlanSlug] ?? 0;
  const currentOrder = PLAN_ORDER[currentPlanSlug] ?? 0;
  const targetOrder = PLAN_ORDER[targetPlanSlug] ?? 0;
  let changeType: ChangeType = 'renewal';
  if (targetOrder > currentOrder) changeType = 'upgrade';
  else if (targetOrder < currentOrder) changeType = 'downgrade';

  let daysRemaining = 0;
  let effectiveAt: string | undefined;
  let scheduledChange: { targetPlanSlug: string; effectiveAt: string } | undefined;

  if (planExpiresAt) {
    const exp = new Date(planExpiresAt).getTime();
    const now = Date.now();
    const remainingMs = Math.max(0, exp - now);
    daysRemaining = Math.floor(remainingMs / MS_PER_DAY);
    if (changeType === 'downgrade') {
      effectiveAt = planExpiresAt;
      scheduledChange = { targetPlanSlug, effectiveAt };
    } else {
      effectiveAt = exp > now ? planExpiresAt : new Date(now).toISOString();
    }
  } else {
    effectiveAt = new Date().toISOString();
  }

  const now = Date.now();
  const isActiveProTrial =
    currentPlanSlug === 'pro' && trialExpiresAt && new Date(trialExpiresAt).getTime() > now && scheduledPlanSlug === 'starter';
  if (isActiveProTrial && targetPlanSlug === 'pro' && trialExpiresAt) {
    effectiveAt = trialExpiresAt;
    scheduledChange = { targetPlanSlug: 'pro', effectiveAt: trialExpiresAt };
  }

  const message = changeType === 'downgrade'
    ? 'El cambio a un plan inferior se aplicará al vencer tu plan actual. No se realiza ningún cargo.'
    : undefined;

  return {
    currentPlanSlug,
    currentPlanPrice,
    targetPlanSlug,
    targetPlanPrice,
    daysRemaining,
    remainingDaysFraction: daysRemaining / 30,
    creditAmount: 0,
    finalAmount: changeType === 'downgrade' ? 0 : targetPrice,
    changeType,
    message,
    effectiveAt,
    scheduledChange,
    prorationFormulaVersion: 'lemon-static',
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
  if (req.method === 'GET') {
    const url = new URL(req.url);
    targetPlanSlug = url.searchParams.get('targetPlanSlug') ?? undefined;
    providerHint = url.searchParams.get('provider') ?? undefined;
  } else {
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      targetPlanSlug = body?.targetPlanSlug as string | undefined;
      providerHint = body?.provider as string | undefined;
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
  const countryCode = resolveBusinessCountryCode(
    biz as { country_code?: string | null; country?: string | null; currency?: string | null },
  );

  // Lemon (fuera de Chile): precios estáticos 6/10 USD. Sin prorrateo.
  const useLemon = providerHint === 'lemonsqueezy' || (countryCode && countryCode !== 'CL');
  let preview: Record<string, unknown>;

  if (useLemon) {
    preview = buildLemonPreview(currentPlanSlug, targetPlanSlug, planExpiresAt, trialExpiresAt, scheduledPlanSlug);
  } else {
    const catalog = getPlanCatalog(countryCode, providerHint);
    if (!catalog) {
      preview = buildLemonPreview(currentPlanSlug, targetPlanSlug, planExpiresAt, trialExpiresAt, scheduledPlanSlug);
    } else {
      preview = computePlanChange(currentPlanSlug, planExpiresAt, targetPlanSlug, catalog);

      const now = Date.now();
      const isActiveProTrial =
        currentPlanSlug === 'pro' && trialExpiresAt && new Date(trialExpiresAt).getTime() > now && scheduledPlanSlug === 'starter';
      if (isActiveProTrial && targetPlanSlug === 'pro' && trialExpiresAt) {
        preview = {
          ...preview,
          effectiveAt: trialExpiresAt,
          scheduledChange: { targetPlanSlug: 'pro', effectiveAt: trialExpiresAt },
        };
      }
    }
  }

  console.log('[plan-change-preview]', {
    currentPlanSlug,
    targetPlanSlug,
    changeType: preview.changeType,
    useLemon,
    finalAmount: preview.finalAmount,
  });

  return jsonResponse(preview, 200);
});
