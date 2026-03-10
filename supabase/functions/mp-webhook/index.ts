// Webhook PÚBLICO de Mercado Pago (no requiere JWT de usuario).
// Configurar verify_jwt = false en supabase/config.toml para esta función.
// URL: https://<project>.supabase.co/functions/v1/mp-webhook
// Secrets: MP_ACCESS_TOKEN. SUPABASE_SERVICE_ROLE_KEY y SUPABASE_URL vienen del runtime.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  console.log('[mp-webhook] request method:', req.method);

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    console.log('[mp-webhook] rejected: method not allowed');
    return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    console.log('[mp-webhook] request body (raw):', raw);
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    console.log('[mp-webhook] bad payload: invalid JSON');
    return jsonResponse({ ok: false, error: 'Invalid JSON' }, 400);
  }

  if (!body || typeof body !== 'object') {
    console.log('[mp-webhook] bad payload: body not object');
    return jsonResponse({ ok: false, error: 'Bad payload' }, 400);
  }

  const type = body?.type as string | undefined;
  const data = body?.data as { id?: string } | undefined;
  const dataId = data?.id != null ? String(data.id) : '';

  console.log('[mp-webhook] notification type:', type, 'payment id:', dataId || '(none)');

  if (type !== 'payment') {
    console.log('[mp-webhook] ignored: type is not payment');
    return jsonResponse({ ok: true }, 200);
  }

  if (!dataId) {
    console.log('[mp-webhook] bad payload: type=payment but data.id missing');
    return jsonResponse({ ok: false, error: 'Missing data.id for payment' }, 400);
  }

  const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
  if (!accessToken) {
    console.error('[mp-webhook] MP_ACCESS_TOKEN not set');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const mpApiStatus = paymentRes.status;
  const mpApiBody = await paymentRes.text();
  console.log('[mp-webhook] Mercado Pago API status:', mpApiStatus, 'body (truncated):', mpApiBody?.slice(0, 200));

  if (!paymentRes.ok) {
    if (mpApiStatus === 401) {
      console.error('[mp-webhook] Mercado Pago API 401: invalid credentials');
      return jsonResponse({ ok: false, error: 'Invalid Mercado Pago API credentials' }, 500);
    }
    if (mpApiStatus === 404 || (mpApiStatus >= 400 && mpApiStatus < 500)) {
      console.log('[mp-webhook] event ignored: payment not found or simulation (MP API', mpApiStatus + ')');
      return jsonResponse({ ok: true, ignored: true, reason: 'payment not found or simulation' }, 200);
    }
    console.log('[mp-webhook] event ignored: Mercado Pago API error', mpApiStatus, '(treated as simulation/not found)');
    return jsonResponse({ ok: true, ignored: true, reason: 'payment not found or simulation' }, 200);
  }

  let payment: { status?: string; external_reference?: string };
  try {
    payment = (JSON.parse(mpApiBody) as { status?: string; external_reference?: string }) ?? {};
  } catch {
    console.log('[mp-webhook] event ignored: invalid payment response body');
    return jsonResponse({ ok: true, ignored: true, reason: 'payment not found or simulation' }, 200);
  }

  const paymentStatus = payment?.status ?? '';
  const externalRef = payment?.external_reference;

  console.log('[mp-webhook] payment status:', paymentStatus, 'external_reference:', externalRef ?? '(none)');

  if (paymentStatus !== 'approved') {
    console.log('[mp-webhook] ignored: payment not approved');
    return jsonResponse({ ok: true }, 200);
  }

  if (!externalRef || typeof externalRef !== 'string') {
    console.log('[mp-webhook] ignored: no external_reference');
    return jsonResponse({ ok: true }, 200);
  }

  const parts = externalRef.split(':');
  const businessId = parts[0];
  const planSlug = parts[1];
  if (!businessId || !planSlug || !['pro', 'business'].includes(planSlug)) {
    console.log('[mp-webhook] ignored: invalid external_reference format');
    return jsonResponse({ ok: true }, 200);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    console.error('[mp-webhook] Supabase env missing');
    return jsonResponse({ ok: false, error: 'Server configuration error' }, 500);
  }

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setDate(expiresAt.getDate() + 30);
  const planExpiresAt = expiresAt.toISOString();

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { error } = await supabase
    .from('wa_businesses')
    .update({ plan_slug: planSlug, plan_expires_at: planExpiresAt })
    .eq('id', businessId);

  if (error) {
    console.error('[mp-webhook] Update plan_slug failed:', error);
    return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
  }

  console.log('[mp-webhook] success: businessId=', businessId, 'planSlug=', planSlug, 'expiresAt=', planExpiresAt);
  return jsonResponse({ ok: true }, 200);
});
