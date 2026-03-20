// send-email — envía correos vía Resend API.
// Soporta: (to, type, data) con templates centralizados, o (to, subject, html) para compatibilidad.
// Acciones admin (JWT + wa_is_admin): action=preview | admin_send_test
// Requiere RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_URL = 'https://api.resend.com/emails';
const FROM_EMAIL = 'Ventalink <hola@mail.ventalink.app>';

const ADMIN_PREVIEW_TYPES = new Set(['welcome', 'email_confirm', 'password_recovery']);

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

function resolveDashboardUrl(data: TemplateData): string {
  const incoming = (data.dashboardUrl as string) || (data.dashboard_url as string) || '';
  const base = (Deno.env.get('APP_BASE_URL') ?? '').replace(/\/$/, '');
  return incoming.trim() || (base ? `${base}/dashboard` : '');
}

/** Combina data del body con name en raíz (compat signup / send-email legacy). */
function buildTemplateDataFromBody(body: Record<string, unknown>): TemplateData {
  const raw = body?.data && typeof body.data === 'object' ? ({ ...(body.data as TemplateData) } as TemplateData) : {};
  if (typeof body?.name === 'string' && body.name.trim()) {
    raw.name = body.name.trim();
  }
  return raw;
}

function renderTemplate(type: string, data: TemplateData): { subject: string; html: string } {
  const d = data as Record<string, unknown>;
  const n = (d.businessName as string) || (d.name as string) || 'Tu negocio';
  const dashboardUrl = resolveDashboardUrl(d);
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
      const person = String(d.user_name || d.name || 'Usuario');
      const biz = String(d.businessName || d.business_name || d.name || 'Tu negocio');
      const subject = `Bienvenido a VentAlink 🚀 Empieza a vender en minutos`;
      const html = `<!doctype html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu catálogo online listo para vender por WhatsApp</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#6d28d9;padding:24px 24px 20px;color:#ffffff;">
          <p style="margin:0;font-size:13px;opacity:.9;">VentAlink</p>
          <h1 style="margin:8px 0 0;font-size:26px;line-height:1.2;">Bienvenido a VentAlink</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#1f2937;">
          <p style="margin:0 0 12px;font-size:16px;">Hola ${escapeHtml(person)},</p>
          <p style="margin:0 0 12px;font-size:15px;line-height:1.6;">Ya estás listo para empezar a vender de forma simple y organizada con <strong>${escapeHtml(biz)}</strong>.</p>
          <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">Con VentAlink puedes crear tu catálogo online y recibir pedidos directamente por WhatsApp, sin complicaciones.</p>
          <ul style="margin:0 0 18px 18px;padding:0;font-size:14px;line-height:1.7;color:#374151;">
            <li>Organiza tus pedidos automáticamente</li>
            <li>Comparte un solo link en todas tus redes</li>
            <li>Recibe pedidos claros, sin mensajes confusos</li>
            <li>Mejora la presentación de tus productos</li>
          </ul>
          ${dashboardUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;"><tr><td style="border-radius:10px;background:#7c3aed;">
            <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Crear mi catálogo</a>
          </td></tr></table>` : ''}
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Empieza en menos de 2 minutos:</p>
          <p style="margin:0 0 4px;font-size:14px;color:#374151;">1. Agrega tu primer producto</p>
          <p style="margin:0 0 4px;font-size:14px;color:#374151;">2. Comparte tu enlace</p>
          <p style="margin:0 0 14px;font-size:14px;color:#374151;">3. Recibe tu primer pedido</p>
          <p style="margin:0 0 14px;font-size:14px;color:#6d28d9;font-weight:700;">Muchos negocios comienzan a recibir pedidos el mismo día.</p>
          <p style="margin:0 0 6px;font-size:14px;color:#374151;">Estamos aquí para ayudarte a crecer.</p>
          <p style="margin:0;font-size:14px;color:#111827;font-weight:700;">Equipo VentAlink</p>
        </td></tr>
        <tr><td style="padding:14px 24px 20px;border-top:1px solid #ede9fe;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Si tienes dudas, puedes responder este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      return { subject, html };
    }
    case 'email_confirm': {
      const confirmUrl = String(d.confirmUrl || d.confirm_url || '');
      const person = String(d.user_name || d.name || 'Usuario');
      const subject = `Confirma tu correo — VentAlink`;
      const html = `<!doctype html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#6d28d9;padding:22px 24px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;line-height:1.25;">Confirma tu correo</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#1f2937;">
          <p style="margin:0 0 12px;font-size:16px;">Hola ${escapeHtml(person)},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Para activar tu cuenta en VentAlink, confirma tu dirección de correo con el botón de abajo.</p>
          ${confirmUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;"><tr><td style="border-radius:10px;background:#7c3aed;">
            <a href="${escapeHtml(confirmUrl)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Confirmar mi correo</a>
          </td></tr></table>` : ''}
          <p style="margin:0;font-size:13px;color:#6b7280;">Si no creaste una cuenta en VentAlink, ignora este mensaje.</p>
        </td></tr>
        <tr><td style="padding:14px 24px 20px;border-top:1px solid #ede9fe;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Si tienes dudas, puedes responder este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      return { subject, html };
    }
    case 'password_recovery': {
      const resetUrl = String(d.resetUrl || d.reset_url || '');
      const person = String(d.user_name || d.name || 'Usuario');
      const subject = `Recupera tu contraseña — VentAlink`;
      const html = `<!doctype html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#6d28d9;padding:22px 24px;color:#ffffff;">
          <h1 style="margin:0;font-size:22px;line-height:1.25;">Recuperar contraseña</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#1f2937;">
          <p style="margin:0 0 12px;font-size:16px;">Hola ${escapeHtml(person)},</p>
          <p style="margin:0 0 18px;font-size:15px;line-height:1.6;">Recibimos una solicitud para restablecer tu contraseña en VentAlink.</p>
          ${resetUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 18px;"><tr><td style="border-radius:10px;background:#7c3aed;">
            <a href="${escapeHtml(resetUrl)}" style="display:inline-block;padding:12px 18px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Elegir nueva contraseña</a>
          </td></tr></table>` : ''}
          <p style="margin:0;font-size:13px;color:#6b7280;">Si no solicitaste este cambio, puedes ignorar este correo.</p>
        </td></tr>
        <tr><td style="padding:14px 24px 20px;border-top:1px solid #ede9fe;">
          <p style="margin:0;font-size:12px;color:#6b7280;">Si tienes dudas, puedes responder este correo.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
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

async function logAdminTest(
  supabase: ReturnType<typeof createClient>,
  opts: {
    adminUserId: string;
    templateKey: string;
    toEmail: string;
    subject: string;
    status: 'sent' | 'failed';
    errorMessage?: string;
  }
) {
  try {
    await supabase.from('wa_admin_email_test_logs').insert({
      admin_user_id: opts.adminUserId,
      template_key: opts.templateKey,
      to_email: opts.toEmail,
      subject: opts.subject,
      status: opts.status,
      error_message: opts.errorMessage || null,
    });
  } catch (e) {
    console.error('[send-email] logAdminTest failed:', e);
  }
}

async function verifyAdmin(
  supabaseUrl: string,
  anonKey: string,
  authHeader: string,
  serviceKey?: string
): Promise<{ ok: true; userId: string } | { ok: false; status: number; message: string }> {
  const h = (authHeader || '').trim();
  if (!h.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: h } },
  });
  const { data: { user }, error: uErr } = await userClient.auth.getUser();
  if (uErr || !user?.id) {
    return { ok: false, status: 401, message: 'Unauthorized' };
  }
  const { data: isAdmin, error: rpcErr } = await userClient.rpc('wa_is_admin');
  if (rpcErr) {
    console.warn('[send-email] wa_is_admin rpc error:', rpcErr.message);
  }
  const rpcSaysAdmin = isAdmin === true || isAdmin === 't' || String(isAdmin).toLowerCase() === 'true';
  if (!rpcErr && rpcSaysAdmin) {
    return { ok: true, userId: user.id };
  }

  // Fallback: RPC no expuesto / sin GRANT / PostgREST — validar rol con service role
  const sk = (serviceKey ?? '').trim();
  if (sk) {
    try {
      const adminClient = createClient(supabaseUrl, sk);
      const { data: row, error: adminErr } = await adminClient.auth.admin.getUserById(user.id);
      if (!adminErr && row?.user) {
        const role = row.user.app_metadata?.role ?? row.user.user_metadata?.role;
        if (role === 'admin') {
          return { ok: true, userId: user.id };
        }
      }
    } catch (e) {
      console.warn('[send-email] admin getUserById fallback failed:', e);
    }
  }

  const hint = rpcErr?.message ? ` (RPC: ${rpcErr.message})` : '';
  return { ok: false, status: 403, message: `Forbidden${hint}` };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  let body: Record<string, unknown>;
  try {
    body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const action = typeof body?.action === 'string' ? body.action.trim() : '';

  if (action === 'preview' || action === 'admin_send_test') {
    if (!supabaseUrl || !anonKey) {
      return jsonResponse({ error: 'Server configuration error' }, 500);
    }
    const authHeader = req.headers.get('authorization') ?? '';
    const admin = await verifyAdmin(supabaseUrl, anonKey, authHeader, serviceKey);
    if (!admin.ok) {
      return jsonResponse({ error: admin.message }, admin.status);
    }

    const emailType = typeof body?.type === 'string' ? body.type.trim() : '';
    if (!emailType || !ADMIN_PREVIEW_TYPES.has(emailType)) {
      return jsonResponse({ error: 'Invalid or unsupported template type for admin' }, 400);
    }

    const templateData = buildTemplateDataFromBody(body);
    const merged: TemplateData = { ...templateData, dashboardUrl: resolveDashboardUrl(templateData) };

    let subject: string;
    let html: string;
    try {
      const rendered = renderTemplate(emailType, merged);
      subject = rendered.subject;
      html = rendered.html;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Template error';
      return jsonResponse({ error: msg }, 400);
    }

    if (action === 'preview') {
      return jsonResponse({ preview: true, type: emailType, subject, html }, 200);
    }

    const to = typeof body?.to === 'string' ? body.to.trim() : '';
    if (!to) return jsonResponse({ error: 'to is required' }, 400);

    const apiKey = Deno.env.get('RESEND_API_KEY');
    if (!apiKey || !apiKey.trim()) {
      return jsonResponse({ error: 'Email service not configured' }, 500);
    }

    const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    try {
      const res = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: FROM_EMAIL,
          to: [to],
          subject,
          html,
        }),
      });

      const resText = await res.text();
      let resData: Record<string, unknown> = {};
      try {
        resData = resText ? (JSON.parse(resText) as Record<string, unknown>) : {};
      } catch {
        /* ignore */
      }

      if (!res.ok) {
        const message = (resData?.message as string) || (resData?.name as string) || resText?.slice(0, 200) || 'Failed to send email';
        console.error('[send-email] admin_send_test Resend error:', { status: res.status, message, resData });
        if (supabase) {
          await logAdminTest(supabase, {
            adminUserId: admin.userId,
            templateKey: emailType,
            toEmail: to,
            subject,
            status: 'failed',
            errorMessage: message,
          });
        }
        return jsonResponse({ error: message, details: resData }, res.status >= 400 && res.status < 500 ? res.status : 500);
      }

      const providerId = (resData?.id as string) || null;
      console.log('[send-email] admin_send_test sent', { to, providerId, subject: subject?.slice(0, 60) });
      if (supabase) {
        await logAdminTest(supabase, {
          adminUserId: admin.userId,
          templateKey: emailType,
          toEmail: to,
          subject,
          status: 'sent',
        });
      }
      return jsonResponse({ success: true, id: providerId, type: emailType, message: 'Queued by provider; check inbox and spam.' }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (supabase) {
        await logAdminTest(supabase, {
          adminUserId: admin.userId,
          templateKey: emailType,
          toEmail: to,
          subject,
          status: 'failed',
          errorMessage: msg,
        });
      }
      return jsonResponse({ error: 'Failed to send email', details: msg }, 500);
    }
  }

  const to = typeof body?.to === 'string' ? body.to.trim() : '';
  if (!to) return jsonResponse({ error: 'to is required' }, 400);

  const emailType = typeof body?.type === 'string' ? body.type.trim() : '';
  const data = buildTemplateDataFromBody(body);

  console.log('[send-email] Request received:', { to, type: emailType, hasData: Object.keys(data).length > 0 });

  let subject: string;
  let html: string;

  if (emailType) {
    try {
      const merged: TemplateData = { ...data, dashboardUrl: resolveDashboardUrl(data) };
      const rendered = renderTemplate(emailType, merged);
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

  console.log('[send-email] Payload to Resend:', { from: resendBody.from, to: resendBody.to, subject: resendBody.subject, htmlLength: resendBody.html?.length ?? 0 });

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

    console.log('[send-email] Resend API response:', { status: res.status, ok: res.ok, body: resData });

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
