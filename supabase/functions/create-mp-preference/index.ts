// create-mp-preference — crea preferencia de pago en Mercado Pago.
// Seguridad: business resuelto 100% por SERVICE_ROLE + auth.uid(). No acepta businessId del frontend.
// Persiste wa_payments (pending) antes de llamar a MP. Idempotencia garantizada por wa_payments.id.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLAN_PRICES: Record<string, number> = { control: 500, pro: 5000, business: 10000 };
const PLAN_LABELS: Record<string, string> = {
  control: 'Plan Control',
  pro: 'Plan Pro',
  business: 'Plan Business',
};

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
  const price    = planSlug ? PLAN_PRICES[planSlug] : undefined;
  console.log('[create-mp-preference] planSlug:', planSlug ?? '(none)', '| price:', price ?? '(inválido)');
  if (!planSlug || price == null || price <= 0) {
    return jsonResponse({ error: 'Plan no válido o sin precio' }, 400);
  }

  // ── 3. Resolver negocio con SERVICE_ROLE (sin RLS, sin ambigüedad) ─────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id, name')
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

  // ── 4. Crear registro de pago pendiente en wa_payments ────────────────────
  const { data: paymentRow, error: paymentInsertError } = await adminClient
    .from('wa_payments')
    .insert({
      business_id:        business.id,
      user_id:            user.id,
      plan_slug:          planSlug,
      amount:             price,
      currency:           'CLP',
      status:             'pending',
      external_reference: 'pending', // se actualiza justo después con el ID real
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
      title:      PLAN_LABELS[planSlug] ?? planSlug,
      quantity:   1,
      unit_price: price,
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
    planLabel:    PLAN_LABELS[planSlug],
    businessId:   business.id,
    paymentId,
    preferenceId: preference?.id,
    sandbox:      isSandbox,
  });

  return jsonResponse({ init_point: initPoint, payment_id: paymentId }, 200);
});
