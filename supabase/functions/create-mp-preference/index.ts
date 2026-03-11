// Create Mercado Pago checkout preference for plan upgrade (Pro / Business).
// JWT is verified by the Supabase gateway before the request reaches this function.
// Requires: Authorization Bearer <user_jwt> (gateway-validated), body: { planSlug, success_url?, failure_url?, ... }
// Returns: { init_point } to redirect the user to MP checkout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLAN_PRICES: Record<string, number> = { control: 500, pro: 5000, business: 10000 };
const PLAN_LABELS: Record<string, string> = { control: 'Plan Control', pro: 'Plan Pro', business: 'Plan Business' };

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
  // 1. OPTIONS must be first, before any auth check
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. Debug logs (method, header presence, prefix)
  const authHeader = (req.headers.get('authorization') ?? '').trim();
  const apikeyHeader = req.headers.get('apikey') ?? '';
  const authPrefix = authHeader.length >= 20 ? authHeader.slice(0, 20) + '...' : authHeader || '(empty)';
  console.log('[create-mp-preference] method:', req.method);
  console.log('[create-mp-preference] authorization present:', authHeader.length > 0);
  console.log('[create-mp-preference] apikey present:', apikeyHeader.length > 0);
  console.log('[create-mp-preference] authorization prefix:', authPrefix);

  // 3. Validate header format — this 401 body is different from the gateway one
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header', source: 'function' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.log('[create-mp-preference] 401 reason: gateway_auth_missing_user');
    return jsonResponse({ error: 'User not authenticated', reason: 'gateway_auth_missing_user' }, 401);
  }
  console.log('[create-mp-preference] user id:', user.id);

  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }
  console.log('[create-mp-preference] request body:', JSON.stringify(body));

  const planSlug = body?.planSlug as string | undefined;
  const price = planSlug && PLAN_PRICES[planSlug];
  console.log('[create-mp-preference] planSlug:', planSlug, 'price:', price);
  if (planSlug === 'control') {
    console.log('[create-mp-preference] plan_control_used (prueba Mercado Pago)');
  }

  if (!planSlug || price == null || price <= 0) {
    return jsonResponse({ error: 'Plan no válido o sin precio' }, 400);
  }

  // Resolver negocio solo por usuario autenticado (no confiar en body.businessId)
  const { data: business, error: bizError } = await supabase
    .from('wa_businesses')
    .select('id, user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  console.log('[create-mp-preference] authenticated user id:', user.id);
  console.log('[create-mp-preference] business from wa_businesses (by user_id):', business ? { id: business.id, user_id: business.user_id } : 'null');
  console.log('[create-mp-preference] business lookup error:', bizError?.message ?? '(none)');

  if (bizError) {
    console.error('[create-mp-preference] business query error:', bizError);
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }
  if (!business?.id) {
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }

  if (business.user_id !== user.id) {
    console.error('[create-mp-preference] 403: business does not belong to authenticated user', { businessUserId: business.user_id, authUserId: user.id });
    return jsonResponse({ error: 'Forbidden: business does not belong to user', reason: 'ownership_mismatch' }, 403);
  }

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!accessToken) {
    console.error('[create-mp-preference] MP_ACCESS_TOKEN missing');
    return jsonResponse({ error: 'MP_ACCESS_TOKEN missing' }, 500);
  }

  const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim() || 'https://app.gong.cl';
  const base = appBaseUrl.replace(/\/$/, '');
  const successUrl = (body?.success_url as string) || `${base}/plans?payment=success`;
  const failureUrl = (body?.failure_url as string) || `${base}/plans?payment=failure`;
  const pendingUrl = (body?.pending_url as string) || `${base}/plans?payment=pending`;

  const notificationUrl = Deno.env.get('MP_WEBHOOK_URL') || '';
  const externalReference = `${business.id}:${planSlug}`;
  console.log('[create-mp-preference] external_reference (final):', externalReference);

  const preferencePayload = {
    items: [
      {
        title: PLAN_LABELS[planSlug] || planSlug,
        quantity: 1,
        unit_price: price,
        currency_id: 'CLP',
      },
    ],
    back_urls: {
      success: successUrl,
      failure: failureUrl,
      pending: pendingUrl,
    },
    auto_return: 'approved' as const,
    external_reference: externalReference,
    ...(notificationUrl && { notification_url: notificationUrl }),
  };

  const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(preferencePayload),
  });

  const mpBody = await mpRes.text();
  if (!mpRes.ok) {
    console.error('[create-mp-preference] Mercado Pago API error:', mpRes.status, mpBody);
    let errPayload: Record<string, unknown>;
    try {
      errPayload = { error: 'Mercado Pago preference creation failed', mp_response: JSON.parse(mpBody) };
    } catch {
      errPayload = { error: 'Mercado Pago preference creation failed', mp_response: mpBody };
    }
    return jsonResponse(errPayload, 500);
  }

  let preference: { init_point?: string; sandbox_init_point?: string };
  try {
    preference = JSON.parse(mpBody) as { init_point?: string; sandbox_init_point?: string };
  } catch {
    return jsonResponse({ error: 'Invalid Mercado Pago response' }, 500);
  }

  const initPoint = preference?.init_point || preference?.sandbox_init_point;
  if (!initPoint) {
    return jsonResponse({ error: 'Mercado Pago response missing init_point', mp_response: preference }, 500);
  }

  const isSandbox = !!preference?.sandbox_init_point;
  console.log('[create-mp-preference] preference_created', {
    planSlug,
    businessId: business.id,
    init_point_preview: initPoint.slice(0, 50) + '...',
    sandbox: isSandbox,
  });
  return jsonResponse({ init_point: initPoint }, 200);
});
