// plan-change-preview — preview de cambio de plan (prorrateo con tiempo exacto, upgrade, downgrade, renewal).
// Requiere JWT. Business resuelto por auth.uid(). No calcula precios en frontend.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Catálogo centralizado: orden, slug, displayName, price, durationDays
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

const PRORATION_FORMULA_VERSION = '2024-03-exact-time';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

type ChangeType = 'upgrade' | 'renewal' | 'downgrade';

function computePlanChange(
  currentPlanSlug: string,
  planExpiresAt: string | null,
  targetPlanSlug: string,
  catalog: PlanCatalog = PLAN_CATALOG_CL,
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
  const durationDays = catalog[targetPlanSlug]?.durationDays ?? 30;

  let changeType: ChangeType = 'renewal';
  if (targetOrder > currentOrder) changeType = 'upgrade';
  else if (targetOrder < currentOrder) changeType = 'downgrade';

  // Tiempo exacto restante (ms)
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
  let country: string | undefined;
  if (req.method === 'GET') {
    const url = new URL(req.url);
    targetPlanSlug = url.searchParams.get('targetPlanSlug') ?? undefined;
    country = url.searchParams.get('country') ?? undefined;
  } else {
    try {
      const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      targetPlanSlug = body?.targetPlanSlug as string | undefined;
      country = body?.country as string | undefined;
    } catch {
      targetPlanSlug = undefined;
      country = undefined;
    }
  }

  if (!targetPlanSlug || !PLAN_ORDER[targetPlanSlug]) {
    console.log('[plan-change-preview] 400: targetPlanSlug inválido o faltante', { targetPlanSlug });
    return jsonResponse({ error: 'targetPlanSlug inválido o faltante' }, 400);
  }

  if (!serviceRoleKey) {
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: biz, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id, plan_slug, plan_expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (bizError || !biz) {
    console.log('[plan-change-preview] 404: business not found', { userId: user.id, error: bizError?.message });
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }
  if (biz.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  const currentPlanSlug = (biz as { plan_slug?: string }).plan_slug ?? 'starter';
  const planExpiresAt = (biz as { plan_expires_at?: string | null }).plan_expires_at ?? null;

  const catalog = getPlanCatalog(country);
  const preview = computePlanChange(currentPlanSlug, planExpiresAt, targetPlanSlug, catalog);

  console.log('[plan-change-preview]', {
    currentPlanSlug,
    targetPlanSlug,
    changeType: preview.changeType,
    daysRemaining: preview.daysRemaining,
    creditAmount: preview.creditAmount,
    finalAmount: preview.finalAmount,
    effectiveAt: preview.effectiveAt ?? null,
  });

  return jsonResponse(preview, 200);
});
