// Create Mercado Pago checkout preference for plan upgrade (Pro / Business).
// Requires: Authorization Bearer <user_jwt>, body: { planSlug: 'pro' | 'business', success_url?, failure_url? }
// Returns: { init_point } to redirect the user to MP checkout.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const PLAN_PRICES: Record<string, number> = { pro: 5000, business: 10000 };
const PLAN_LABELS: Record<string, string> = { pro: 'Plan Pro', business: 'Plan Business' };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (!user?.id) {
      return new Response(JSON.stringify({ error: 'No autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json().catch(() => ({}));
    const planSlug = body?.planSlug;
    const price = planSlug && PLAN_PRICES[planSlug];
    if (!planSlug || price == null || price <= 0) {
      return new Response(JSON.stringify({ error: 'Plan no válido o sin precio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: business, error: bizError } = await supabase
      .from('wa_businesses')
      .select('id')
      .limit(1)
      .maybeSingle();

    if (bizError || !business?.id) {
      return new Response(JSON.stringify({ error: 'No se encontró tu negocio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const accessToken = Deno.env.get('MP_ACCESS_TOKEN');
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'Mercado Pago no configurado' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const appBaseUrl = Deno.env.get('APP_BASE_URL')?.trim() || 'https://app.gong.cl';
    const base = appBaseUrl.replace(/\/$/, '');
    const successUrl = body?.success_url || `${base}/plans?payment=success`;
    const failureUrl = body?.failure_url || `${base}/plans?payment=failure`;
    const pendingUrl = body?.pending_url || `${base}/plans?payment=pending`;

    const notificationUrl = Deno.env.get('MP_WEBHOOK_URL') || '';
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
      external_reference: `${business.id}:${planSlug}`,
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

    if (!mpRes.ok) {
      const errText = await mpRes.text();
      console.error('Mercado Pago error:', mpRes.status, errText);
      return new Response(JSON.stringify({ error: 'Error al crear el pago en Mercado Pago' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const preference = await mpRes.json();
    const initPoint = preference?.init_point || preference?.sandbox_init_point;
    if (!initPoint) {
      return new Response(JSON.stringify({ error: 'Respuesta inválida de Mercado Pago' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ init_point: initPoint }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: 'Error interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
