// Create Mercado Pago checkout preference for plan upgrade.
// JWT is validated via supabase.auth.getUser(). Business resolved via SERVICE_ROLE (bypasses RLS entirely).
// Frontend must send only planSlug — no businessId accepted.

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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  console.log('[create-mp-preference] method:', req.method);
  console.log('[create-mp-preference] authorization present:', authHeader.length > 0);

  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // 1. Validate user via JWT (user-context client)
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.log('[create-mp-preference] 401: could not get user from JWT', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }
  console.log('[create-mp-preference] auth.uid():', user.id);
  console.log('[create-mp-preference] auth.email():', user.email ?? '(no email)');

  // Parse body — businessId is explicitly ignored
  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    body = {};
  }
  if (body?.businessId) {
    console.warn('[create-mp-preference] businessId received in body but IGNORED — resolved from auth.uid() only');
  }

  const planSlug = body?.planSlug as string | undefined;
  const price = planSlug ? PLAN_PRICES[planSlug] : undefined;
  console.log('[create-mp-preference] planSlug:', planSlug, '| price:', price ?? '(invalid)');
  if (planSlug === 'control') {
    console.log('[create-mp-preference] plan_control_used (prueba Mercado Pago)');
  }
  if (!planSlug || price == null || price <= 0) {
    return jsonResponse({ error: 'Plan no válido o sin precio' }, 400);
  }

  // 2. Resolve business using SERVICE_ROLE — completely bypasses RLS, no ambiguity
  if (!serviceRoleKey) {
    console.error('[create-mp-preference] SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id')
    .eq('user_id', user.id);

  const rowCount = businesses?.length ?? 0;
  console.log('[create-mp-preference] wa_businesses rows for auth.uid()', user.id, '→ count:', rowCount);
  if (rowCount > 0) {
    businesses!.forEach((b, i) =>
      console.log(`[create-mp-preference] business[${i}]: id=${b.id} user_id=${b.user_id}`)
    );
  }

  if (bizError) {
    console.error('[create-mp-preference] business query error:', bizError.message);
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }
  if (rowCount === 0) {
    console.error('[create-mp-preference] 404: no business found for user', user.id);
    return jsonResponse({ error: 'Business not found for user', reason: 'no_business' }, 404);
  }
  if (rowCount > 1) {
    console.error('[create-mp-preference] 409: multiple businesses found for user', user.id, '→ ids:', businesses!.map(b => b.id).join(', '));
    return jsonResponse({ error: 'Multiple businesses found for user', reason: 'multiple_businesses', count: rowCount }, 409);
  }

  const business = businesses![0];

  // 3. Final ownership assertion (defense in depth)
  if (business.user_id !== user.id) {
    console.error('[create-mp-preference] 403: ownership mismatch', { business_user_id: business.user_id, auth_uid: user.id });
    return jsonResponse({ error: 'Forbidden', reason: 'ownership_mismatch' }, 403);
  }

  console.log('[create-mp-preference] business.id chosen:', business.id);
  console.log('[create-mp-preference] business.user_id confirmed:', business.user_id);

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
