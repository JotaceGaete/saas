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

  console.log('[mp-webhook] webhook_received', { type, payment_id: dataId || null });

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

  console.log('[mp-webhook] payment_status', { status: paymentStatus, external_reference: externalRef ?? null });

  if (paymentStatus !== 'approved') {
    console.log('[mp-webhook] payment_not_approved', { status: paymentStatus, action: 'ignored' });
    return jsonResponse({ ok: true }, 200);
  }

  if (!externalRef || typeof externalRef !== 'string') {
    console.log('[mp-webhook] ignored: no external_reference');
    return jsonResponse({ ok: true }, 200);
  }

  const parts = externalRef.split(':');
  const businessId = parts[0];
  const planSlug = parts[1];
  const allowedPlans = ['control', 'pro', 'business'];
  if (!businessId || !planSlug || !allowedPlans.includes(planSlug)) {
    console.log('[mp-webhook] ignored: invalid external_reference format');
    return jsonResponse({ ok: true }, 200);
  }
  if (planSlug === 'control') {
    console.log('[mp-webhook] plan_control_used (prueba Mercado Pago)');
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

  let updatePayload: { plan_slug: string; plan_expires_at?: string } = { plan_slug: planSlug, plan_expires_at: planExpiresAt };
  let { error } = await supabase
    .from('wa_businesses')
    .update(updatePayload)
    .eq('id', businessId);

  if (error) {
    const isPlanExpiresAtMissing =
      error?.message?.includes('plan_expires_at') || error?.code === 'PGRST204';
    if (isPlanExpiresAtMissing) {
      console.log('[mp-webhook] plan_expires_at column missing or schema cache stale, updating only plan_slug');
      updatePayload = { plan_slug: planSlug };
      const retry = await supabase.from('wa_businesses').update(updatePayload).eq('id', businessId);
      if (retry.error) {
        console.error('[mp-webhook] Update plan_slug failed:', retry.error);
        return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
      }
    } else {
      console.error('[mp-webhook] Update plan_slug failed:', error);
      return jsonResponse({ ok: false, error: 'Database update failed' }, 500);
    }
  }

  console.log('[mp-webhook] payment_approved', {
    businessId,
    planSlug,
    planExpiresAt,
    table: 'wa_businesses',
  });
  return jsonResponse({ ok: true }, 200);
});
