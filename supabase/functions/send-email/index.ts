// send-email — envía correos vía Resend API.
// Soporta: (to, type, data) con templates centralizados, o (to, subject, html) para compatibilidad.
// Requiere RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
//
// JWT: temporalmente desactivado (config.toml). Para reactivar: verify_jwt = true y redeploy.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Ventalink <hola@mail.ventalink.app>';

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

function escapeHtml(s: unknown): string {
  if (s == null || s === undefined) return '';
  const t = String(s);
  return t
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatCurrency(value: number, currency = 'CLP'): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency === 'ARS' ? 'ARS' : currency === 'USD' ? 'USD' : 'CLP',
    minimumFractionDigits: 0,
  }).format(value);
}

type TemplateData = Record<string, unknown>;

function renderTemplate(type: string, data: TemplateData): { subject: string; html: string } {
  const d = data as Record<string, unknown>;
  const n = (d.businessName as string) || (d.name as string) || 'Tu negocio';
  const dashboardUrl = (d.dashboardUrl as string) || '';
  const dateStr = (d.date as string) || new Date().toISOString().slice(0, 10);
  const fmt = (x: unknown) => formatCurrency(Number(x) || 0, (d.currency as string) || 'CLP');

  switch (type) {
    case 'daily_summary': {
      const orderCount = Number(d.orderCount) || 0;
      const totalSold = Number(d.totalSold) || 0;
      const topProducts = (d.topProducts as Array<{ productName?: string; name?: string; totalQty?: number; totalRevenue?: number }>) || [];
      const topRows = topProducts
        .slice(0, 5)
        .map(
          (p) =>
            `<tr><td style="padding:6px 12px">${escapeHtml(p.productName || p.name || 'Producto')}</td><td style="padding:6px 12px">${p.totalQty ?? 0}</td><td style="padding:6px 12px">${formatCurrency(p.totalRevenue ?? 0)}</td></tr>`
        )
        .join('');
      const subject = `Resumen del día ${dateStr} — ${n}`;
      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
  <h1 style="font-size:1.25rem;margin-bottom:8px">Resumen del día</h1>
  <p style="color:#666;margin:0 0 20px">${escapeHtml(n)} · ${dateStr}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6">Pedidos</th><td style="padding:8px 12px"><strong>${orderCount}</strong></td></tr>
    <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6">Total vendido</th><td style="padding:8px 12px"><strong>${fmt(totalSold)}</strong></td></tr>
  </table>
  ${topRows ? `<h2 style="font-size:1rem;margin:16px 0 8px">Productos más vendidos</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px 12px">Producto</th><th style="text-align:right;padding:6px 12px">Cant.</th><th style="text-align:right;padding:6px 12px">Total</th></tr></thead><tbody>${topRows}</tbody></table>` : ''}
  ${dashboardUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(dashboardUrl)}" style="color:#7C3AED;text-decoration:none;font-weight:600">Ver panel →</a></p>` : ''}
  <p style="margin-top:32px;font-size:0.875rem;color:#9ca3af">Ventalink — Catálogo y pedidos por WhatsApp</p>
</body></html>`;
      return { subject, html };
    }
    case 'weekly_summary': {
      const orderCount = Number(d.orderCount) || 0;
      const totalSold = Number(d.totalSold) || 0;
      const topProducts = (d.topProducts as Array<{ productName?: string; name?: string; totalQty?: number; totalRevenue?: number }>) || [];
      const topRows = topProducts
        .slice(0, 5)
        .map(
          (p) =>
            `<tr><td style="padding:6px 12px">${escapeHtml(p.productName || p.name || 'Producto')}</td><td style="padding:6px 12px">${p.totalQty ?? 0}</td><td style="padding:6px 12px">${formatCurrency(p.totalRevenue ?? 0)}</td></tr>`
        )
        .join('');
      const subject = `Resumen semanal — ${n}`;
      const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#333">
  <h1 style="font-size:1.25rem;margin-bottom:8px">Resumen semanal</h1>
  <p style="color:#666;margin:0 0 20px">${escapeHtml(n)} · ${dateStr}</p>
  <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
    <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6">Pedidos</th><td style="padding:8px 12px"><strong>${orderCount}</strong></td></tr>
    <tr><th style="text-align:left;padding:8px 12px;background:#f3f4f6">Total vendido</th><td style="padding:8px 12px"><strong>${fmt(totalSold)}</strong></td></tr>
  </table>
  ${topRows ? `<h2 style="font-size:1rem;margin:16px 0 8px">Productos más vendidos</h2><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:6px 12px">Producto</th><th style="text-align:right;padding:6px 12px">Cant.</th><th style="text-align:right;padding:6px 12px">Total</th></tr></thead><tbody>${topRows}</tbody></table>` : ''}
  ${dashboardUrl ? `<p style="margin-top:24px"><a href="${escapeHtml(dashboardUrl)}" style="color:#7C3AED;text-decoration:none;font-weight:600">Ver panel →</a></p>` : ''}
  <p style="margin-top:32px;font-size:0.875rem;color:#9ca3af">Ventalink — Catálogo y pedidos por WhatsApp</p>
</body></html>`;
      return { subject, html };
    }
    case 'welcome': {
      const subject = `Bienvenido a Ventalink`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Bienvenido a Ventalink. Tu catálogo está listo para recibir pedidos por WhatsApp.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}">Ir al panel</a></p>` : ''}<p>— Equipo Ventalink</p>`;
      return { subject, html };
    }
    case 'trial_expiring': {
      const daysLeft = Number(d.daysLeft) ?? 1;
      const subject = `Tu prueba de Pro vence en ${daysLeft} día${daysLeft !== 1 ? 's' : ''}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Tu período de prueba del plan Pro termina pronto. Mantén Pro para seguir con pedidos ilimitados y estadísticas.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}/planes">Ver planes</a></p>` : ''}<p>— Equipo Ventalink</p>`;
      return { subject, html };
    }
    case 'payment_confirmed': {
      const planSlug = (d.planSlug as string) || 'Pro';
      const amount = Number(d.amount) || 0;
      const subject = `Pago confirmado — Plan ${planSlug}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Tu pago de ${fmt(amount)} fue confirmado. Ahora tienes acceso al plan ${escapeHtml(planSlug)}.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}">Ir al panel</a></p>` : ''}<p>— Equipo Ventalink</p>`;
      return { subject, html };
    }
    case 'plan_changed': {
      const oldPlan = (d.oldPlan as string) || '';
      const newPlan = (d.newPlan as string) || '';
      const subject = `Cambio de plan a ${newPlan}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Tu plan ha cambiado de ${escapeHtml(oldPlan)} a ${escapeHtml(newPlan)}.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}">Ir al panel</a></p>` : ''}<p>— Equipo Ventalink</p>`;
      return { subject, html };
    }
    case 'new_order': {
      const customerName = (d.customerName as string) || 'Cliente';
      const total = Number(d.total) || 0;
      const subject = `Nuevo pedido de ${escapeHtml(customerName)}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Recibiste un nuevo pedido de ${escapeHtml(customerName)} por ${fmt(total)}.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}/orders">Ver pedidos</a></p>` : ''}<p>— Ventalink</p>`;
      return { subject, html };
    }
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

async function logEmail(
  supabase: ReturnType<typeof createClient>,
  opts: { userId?: string; businessId?: string; toEmail: string; type: string; status: 'sent' | 'failed'; providerMessageId?: string; errorMessage?: string }
) {
  try {
    await supabase.from('wa_email_logs').insert({
      user_id: opts.userId || null,
      business_id: opts.businessId || null,
      to_email: opts.toEmail,
      type: opts.type,
      status: opts.status,
      provider_message_id: opts.providerMessageId || null,
      error_message: opts.errorMessage || null,
    });
  } catch (e) {
    console.error('[send-email] logEmail failed:', e);
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  let body: {
    to?: unknown;
    subject?: unknown;
    html?: unknown;
    type?: unknown;
    data?: unknown;
    userId?: unknown;
    businessId?: unknown;
  };
  try {
    body = (await req.json().catch(() => ({}))) as typeof body;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!to) return jsonResponse({ error: 'to is required' }, 400);

  const emailType = typeof body?.type === 'string' ? body.type.trim() : '';
  const data = body?.data && typeof body.data === 'object' ? (body.data as TemplateData) : {};

  let subject: string;
  let html: string;

  if (emailType) {
    try {
      const incoming = (data.dashboardUrl as string) || '';
      const base = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '');
      const dashboardUrl = incoming || (base ? `${base}/dashboard` : '');
      const rendered = renderTemplate(emailType, { ...data, dashboardUrl });
      subject = rendered.subject;
      html = rendered.html;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Template error';
      return jsonResponse({ error: msg }, 400);
    }
  } else {
    subject = typeof body?.subject === 'string' ? body.subject.trim() : '';
    html = typeof body?.html === 'string' ? body.html : '';
    if (!subject || !html) {
      return jsonResponse({ error: 'subject and html are required when type is not provided' }, 400);
    }
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey || !apiKey.trim()) {
    console.error('[send-email] RESEND_API_KEY not configured');
    return jsonResponse({ error: 'Email service not configured' }, 500);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

  const userId = typeof body.userId === 'string' ? body.userId : undefined;
  const businessId = typeof body.businessId === 'string' ? body.businessId : undefined;
  const logType = emailType || 'custom';

  const resendBody = {
    from: FROM_EMAIL,
    to: [to],
    subject,
    html,
  };

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resendBody),
    });

    const resText = await res.text();
    let resData: Record<string, unknown> = {};
    try {
      resData = resText ? (JSON.parse(resText) as Record<string, unknown>) : {};
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      console.error('[send-email] Resend API error:', res.status, resText?.slice(0, 300));
      const message = (resData?.message as string) || (resData?.name as string) || 'Failed to send email';
      if (supabase) {
        await logEmail(supabase, {
          userId,
          businessId,
          toEmail: to,
          type: logType,
          status: 'failed',
          errorMessage: message,
        });
      }
      return jsonResponse({ error: message, details: resData }, res.status >= 400 && res.status < 500 ? res.status : 500);
    }

    const providerId = (resData?.id as string) || null;
    if (supabase) {
      await logEmail(supabase, {
        userId,
        businessId,
        toEmail: to,
        type: logType,
        status: 'sent',
        providerMessageId: providerId,
      });
    }

    return jsonResponse({ success: true, id: providerId }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[send-email] fetch error:', msg);
    if (supabase) {
      await logEmail(supabase, {
        userId,
        businessId,
        toEmail: to,
        type: logType,
        status: 'failed',
        errorMessage: msg,
      });
    }
    return jsonResponse({ error: 'Failed to send email', details: msg }, 500);
  }
});
