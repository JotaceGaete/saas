// Webhook de Mercado Pago: al recibir notificación de pago aprobado, actualiza plan del negocio.
// Configurar en Mercado Pago: Webhooks > Payments > URL = https://<project>.supabase.co/functions/v1/mp-webhook
// Secrets: MP_ACCESS_TOKEN, SUPABASE_SERVICE_ROLE_KEY (ya disponible en Supabase).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const type = body?.type;
    const dataId = body?.data?.id;

    if (type !== 'payment' || !dataId) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!accessToken) {
      console.error('MP_ACCESS_TOKEN not set');
      return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const paymentRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!paymentRes.ok) {
      console.error('MP get payment failed:', paymentRes.status);
      return new Response(JSON.stringify({ ok: false }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const payment = await paymentRes.json();
    if (payment?.status !== 'approved') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const externalRef = payment?.external_reference;
    if (!externalRef || typeof externalRef !== 'string') {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const parts = externalRef.split(':');
    const businessId = parts[0];
    const planSlug = parts[1];
    if (!businessId || !planSlug || !['pro', 'business'].includes(planSlug)) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Supabase env missing');
      return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await supabase
      .from('wa_businesses')
      .update({ plan_slug: planSlug })
      .eq('id', businessId);

    if (error) {
      console.error('Update plan_slug failed:', error);
      return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
