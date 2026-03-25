// send-daily-summary — envía resumen diario a comercios con cobros ese día.
// Ejecutar 1 vez al día vía cron (pg_cron + pg_net).
// Criterio: pedidos pagados con `paid_at` en el día (ingresos reconocidos; ver trigger wa_orders_set_paid_at).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const appBaseUrl = (Deno.env.get('APP_BASE_URL') ?? 'https://go.ventalink.app').replace(/\/$/, '');
  const dashboardUrl = `${appBaseUrl}/dashboard`;

  if (!supabaseUrl || !serviceKey) {
    console.error('[send-daily-summary] missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  // Docs: use anon key for function-to-function calls, not service_role
  const invokeToken = anonKey || serviceKey;

  let targetDate: Date;
  try {
    const body = req.method === 'POST' ? (await req.json().catch(() => ({}))) as { date?: string } : {};
    const dateParam = req.method === 'GET' ? new URL(req.url).searchParams.get('date') : body?.date;
    if (typeof dateParam === 'string' && dateParam) {
      targetDate = new Date(dateParam);
      if (!Number.isFinite(targetDate.getTime())) throw new Error('invalid date');
    } else {
      const now = new Date();
      targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    }
  } catch {
    return jsonResponse({ error: 'invalid date parameter' }, 400);
  }

  const dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate());
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const dayStartIso = dayStart.toISOString();
  const dayEndIso = dayEnd.toISOString();
  const dateStr = dayStart.toISOString().slice(0, 10);
  const qStart = `"${dayStartIso.replace(/"/g, '\\"')}"`;
  const qEnd = `"${dayEndIso.replace(/"/g, '\\"')}"`;

  const admin = createClient(supabaseUrl, serviceKey);

  const { data: ordersWithBusiness, error: ordersErr } = await admin
    .from('wa_orders')
    .select('id, business_id, total_amount, paid_at, updated_at')
    .eq('payment_status', 'pagado')
    .or(
      `and(paid_at.is.null,updated_at.gte.${qStart},updated_at.lt.${qEnd}),and(paid_at.gte.${qStart},paid_at.lt.${qEnd})`,
    );

  if (ordersErr) {
    console.error('[send-daily-summary] orders query error:', ordersErr.message);
    return jsonResponse({ error: 'Failed to fetch orders', detail: ordersErr.message }, 500);
  }

  const revenueInstant = (o: { paid_at?: string | null; updated_at?: string | null }) => {
    if (o.paid_at) {
      const t = new Date(o.paid_at);
      if (!Number.isNaN(t.getTime())) return t;
    }
    if (o.updated_at) {
      const t = new Date(o.updated_at);
      if (!Number.isNaN(t.getTime())) return t;
    }
    return null;
  };

  const ordersInDay = (ordersWithBusiness ?? []).filter((o) => {
    const t = revenueInstant(o);
    return t !== null && t >= dayStart && t < dayEnd;
  });

  const businessIds = [...new Set(ordersInDay.map((o) => o.business_id).filter(Boolean))] as string[];
  if (businessIds.length === 0) {
    console.log('[send-daily-summary] no activity for', dateStr);
    return jsonResponse({ sent: 0, message: 'No businesses with paid orders that day' }, 200);
  }

  const { data: businesses, error: bizErr } = await admin
    .from('wa_businesses')
    .select('id, user_id, name, email, currency')
    .in('id', businessIds);

  if (bizErr || !businesses?.length) {
    console.error('[send-daily-summary] businesses query error:', bizErr?.message);
    return jsonResponse({ error: 'Failed to fetch businesses' }, 500);
  }

  const sendEmailUrl = `${supabaseUrl}/functions/v1/send-email`;

  let sent = 0;
  const results: Array<{
    businessId: string;
    to: string;
    status: string;
    response_status?: number;
    error_message?: string;
    response_body?: unknown;
  }> = [];

  for (const biz of businesses) {
    let email = (biz.email ?? '').trim();
    if (!email && biz.user_id) {
      try {
        const { data: userData } = await admin.auth.admin.getUserById(biz.user_id);
        email = (userData?.user?.email ?? '').trim();
      } catch {
        /* ignore */
      }
    }
    if (!email) {
      results.push({ businessId: biz.id, to: '(no email)', status: 'skipped' });
      continue;
    }

    const bizOrders = ordersInDay.filter((o) => o.business_id === biz.id);
    const orderCount = bizOrders.length;
    const totalSold = bizOrders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);

    const orderIds = bizOrders.map((o) => o.id);
    let topProducts: Array<{ productName: string; totalQty: number; totalRevenue: number }> = [];
    if (orderIds.length > 0) {
      const { data: items } = await admin
        .from('wa_order_items')
        .select('product_name, quantity, subtotal')
        .in('order_id', orderIds);
      const map: Record<string, { productName: string; totalQty: number; totalRevenue: number }> = {};
      (items ?? []).forEach((row) => {
        const name = (row.product_name ?? 'Producto').trim() || 'Producto';
        if (!map[name]) map[name] = { productName: name, totalQty: 0, totalRevenue: 0 };
        map[name].totalQty += Number(row.quantity) || 0;
        map[name].totalRevenue += Number(row.subtotal) || 0;
      });
      topProducts = Object.values(map).sort((a, b) => b.totalQty - a.totalQty).slice(0, 5);
    }

    const payload = {
      to: email,
      type: 'daily_summary',
      data: {
        businessName: biz.name ?? 'Tu negocio',
        orderCount,
        totalSold,
        topProducts,
        dashboardUrl,
        date: dateStr,
        currency: biz.currency ?? 'CLP',
      },
      userId: biz.user_id ?? undefined,
      businessId: biz.id,
    };

    try {
      const res = await fetch(sendEmailUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${invokeToken}`,
          apikey: anonKey || serviceKey,
        },
        body: JSON.stringify(payload),
      });
      const resText = await res.text();
      let resBody: Record<string, unknown> = {};
      try {
        resBody = resText ? (JSON.parse(resText) as Record<string, unknown>) : {};
      } catch {
        resBody = { _raw: resText?.slice(0, 500) };
      }
      const ok = res.ok;
      const errMsg = (resBody?.error as string) || null;
      const errDetails = resBody?.details as unknown;
      if (ok) {
        sent++;
        results.push({ businessId: biz.id, to: email, status: 'sent' });
      } else {
        console.error('[send-daily-summary] send-email failed for', biz.id, res.status, errMsg, resBody);
        results.push({
          businessId: biz.id,
          to: email,
          status: 'failed',
          response_status: res.status,
          error_message: errMsg || `HTTP ${res.status}`,
          response_body: resBody,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[send-daily-summary] fetch send-email error:', err);
      results.push({
        businessId: biz.id,
        to: email,
        status: 'error',
        error_message: msg,
      });
    }
  }

  console.log('[send-daily-summary]', dateStr, 'sent:', sent, 'total businesses:', businessIds.length);
  return jsonResponse({ sent, total: businessIds.length, date: dateStr, results }, 200);
});
