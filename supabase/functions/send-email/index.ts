// send-email — envía correos vía Resend API.
// Soporta: (to, type, data) con templates centralizados, o (to, subject, html) para compatibilidad.
// Acciones admin (JWT + wa_is_admin): action=preview | admin_send_test
// Requiere RESEND_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const RESEND_API_URL = 'https://api.resend.com/emails';
const EMAIL_AUTOMATION_DISABLED_REASON = 'EMAIL_AUTOMATION_DISABLED';

function isEmailAutomationEnabled() {
  return Deno.env.get('EMAIL_AUTOMATION_ENABLED') === 'true';
}
const FROM_EMAIL = 'Walinka <hola@mail.ventalink.app>';

const ADMIN_PREVIEW_TYPES = new Set([
  'welcome', 'email_confirm', 'password_recovery', 'activation_24h', 'test_ping',
  'trial_expiring', 'payment_confirmed', 'plan_changed', 'new_order', 'daily_summary', 'weekly_summary',
]);

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
  <p style="margin-top:32px;font-size:0.875rem;color:#9ca3af">Walinka — Catálogo y pedidos por WhatsApp</p>
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
  <p style="margin-top:32px;font-size:0.875rem;color:#9ca3af">Walinka — Catálogo y pedidos por WhatsApp</p>
</body></html>`;
      return { subject, html };
    }
    case 'welcome': {
      const person = String(d.user_name || d.name || 'Usuario');
      const biz = String(d.businessName || d.business_name || d.name || 'Tu negocio');
      const subject = `${escapeHtml(person)}, tu tienda online está lista — empieza hoy`;
      const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <meta name="color-scheme" content="light"/>
  <title>Bienvenido a VentAlink</title>
</head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;text-size-adjust:100%;">

  <!-- Preheader oculto -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">Tu catálogo online ya existe. Compártelo hoy y recibe tu primer pedido.</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f5f3ff;padding:32px 16px;">
    <tr><td align="center">

      <!-- Card principal -->
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:580px;">

        <!-- Logo bar -->
        <tr>
          <td style="padding:0 0 20px;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td style="background:#7c3aed;border-radius:10px;padding:6px 14px;">
                  <span style="font-size:13px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">VentAlink</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background:#ffffff;border-radius:16px 16px 0 0;padding:40px 36px 32px;">
            <p style="margin:0 0 10px;font-size:13px;font-weight:600;color:#7c3aed;letter-spacing:0.8px;text-transform:uppercase;">Bienvenido</p>
            <h1 style="margin:0 0 16px;font-size:28px;font-weight:800;line-height:1.25;color:#111827;">Hola ${escapeHtml(person)},<br/>ya puedes vender online.</h1>
            <p style="margin:0;font-size:16px;line-height:1.7;color:#4b5563;">
              <strong style="color:#111827;">${escapeHtml(biz)}</strong> ya tiene su espacio en VentAlink.
              Ahora solo necesitas agregar tus productos, compartir el link y empezar a recibir pedidos por WhatsApp.
            </p>
          </td>
        </tr>

        <!-- Separador con gradiente -->
        <tr>
          <td style="background:linear-gradient(90deg,#7c3aed,#a78bfa);height:3px;font-size:0;line-height:0;">&nbsp;</td>
        </tr>

        <!-- Pasos -->
        <tr>
          <td style="background:#faf9ff;padding:32px 36px;">
            <p style="margin:0 0 20px;font-size:13px;font-weight:700;color:#6b7280;letter-spacing:0.6px;text-transform:uppercase;">Cómo empezar</p>

            <!-- Paso 1 -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:16px;">
              <tr>
                <td width="36" valign="top">
                  <div style="width:28px;height:28px;background:#7c3aed;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#ffffff;">1</div>
                </td>
                <td style="padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Agrega tus productos</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">Foto, nombre, precio y descripción. Listo en minutos.</p>
                </td>
              </tr>
            </table>

            <!-- Paso 2 -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin-bottom:16px;">
              <tr>
                <td width="36" valign="top">
                  <div style="width:28px;height:28px;background:#7c3aed;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#ffffff;">2</div>
                </td>
                <td style="padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Comparte tu link único</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">Instagram, WhatsApp, TikTok — un solo enlace para todo.</p>
                </td>
              </tr>
            </table>

            <!-- Paso 3 -->
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td width="36" valign="top">
                  <div style="width:28px;height:28px;background:#7c3aed;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:700;color:#ffffff;">3</div>
                </td>
                <td style="padding-left:12px;">
                  <p style="margin:0;font-size:14px;font-weight:700;color:#111827;">Recibe pedidos ordenados</p>
                  <p style="margin:4px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">Cada pedido llega claro y completo, directo a tu WhatsApp.</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- CTA -->
        <tr>
          <td style="background:#ffffff;padding:32px 36px 36px;text-align:center;">
            <p style="margin:0 0 8px;font-size:15px;color:#4b5563;line-height:1.6;">
              Muchos negocios reciben su <strong style="color:#7c3aed;">primer pedido el mismo día</strong> que comparten el link.
            </p>
            <p style="margin:0 0 28px;font-size:13px;color:#9ca3af;">Tu catálogo te espera — solo falta el primer paso.</p>
            ${dashboardUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 auto;">
              <tr>
                <td style="background:#7c3aed;border-radius:12px;box-shadow:0 4px 14px rgba(124,58,237,0.35);">
                  <a href="${escapeHtml(dashboardUrl)}" style="display:inline-block;padding:15px 32px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;letter-spacing:0.3px;">Abrir mi panel →</a>
                </td>
              </tr>
            </table>` : ''}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f8ff;border-radius:0 0 16px 16px;padding:20px 36px;border-top:1px solid #ede9fe;">
            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
              <tr>
                <td>
                  <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:#374151;">Equipo VentAlink</p>
                  <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">Si necesitas ayuda, escríbenos a <a href="mailto:contacto@ventalink.app" style="color:#7c3aed;text-decoration:none;">contacto@ventalink.app</a></p>
                  <p style="margin:0;font-size:11px;"><a href="mailto:contacto@ventalink.app?subject=Desuscribir" style="color:#d1d5db;text-decoration:underline;">Dejar de recibir estos correos</a></p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

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
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">Si necesitas ayuda, escríbenos a <a href="mailto:contacto@ventalink.app" style="color:#7c3aed;text-decoration:none;">contacto@ventalink.app</a></p>
          <p style="margin:0;font-size:11px;"><a href="mailto:contacto@ventalink.app?subject=Desuscribir" style="color:#9ca3af;text-decoration:underline;">Dejar de recibir estos correos</a></p>
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
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">Si necesitas ayuda, escríbenos a <a href="mailto:contacto@ventalink.app" style="color:#7c3aed;text-decoration:none;">contacto@ventalink.app</a></p>
          <p style="margin:0;font-size:11px;"><a href="mailto:contacto@ventalink.app?subject=Desuscribir" style="color:#9ca3af;text-decoration:underline;">Dejar de recibir estos correos</a></p>
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
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Tu período de prueba del plan Pro termina pronto. Mantén Pro para seguir con pedidos ilimitados y estadísticas.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}/planes">Ver planes</a></p>` : ''}<p>— Equipo Walinka</p>`;
      return { subject, html };
    }
    case 'payment_confirmed': {
      const planSlug = (d.planSlug as string) || 'Pro';
      const amount = Number(d.amount) || 0;
      const subject = `Pago confirmado — Plan ${planSlug}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Tu pago de ${fmt(amount)} fue confirmado. Ahora tienes acceso al plan ${escapeHtml(planSlug)}.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}">Ir al panel</a></p>` : ''}<p>— Equipo Walinka</p>`;
      return { subject, html };
    }
    case 'plan_changed': {
      const oldPlan = (d.oldPlan as string) || '';
      const newPlan = (d.newPlan as string) || '';
      const subject = `Cambio de plan a ${newPlan}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Tu plan ha cambiado de ${escapeHtml(oldPlan)} a ${escapeHtml(newPlan)}.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}">Ir al panel</a></p>` : ''}<p>— Equipo Walinka</p>`;
      return { subject, html };
    }
    case 'new_order': {
      const customerName = (d.customerName as string) || 'Cliente';
      const total = Number(d.total) || 0;
      const subject = `Nuevo pedido de ${escapeHtml(customerName)}`;
      const html = `<p>Hola ${escapeHtml(n)},</p><p>Recibiste un nuevo pedido de ${escapeHtml(customerName)} por ${fmt(total)}.</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}/orders">Ver pedidos</a></p>` : ''}<p>— Walinka</p>`;
      return { subject, html };
    }
    case 'activation_24h': {
      // Template replicado en src/emails/activation24hEmail.js — mantener sincronizados.
      const catalogUrl = String(d.catalogUrl || d.catalog_url || '');
      const subject = `Tu catálogo ya está listo — ¡compártelo y recibe pedidos!`;
      const html = `<!doctype html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#f5f3ff;font-family:Arial,Helvetica,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Tu catálogo online está listo — compártelo ahora y empieza a recibir pedidos.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f3ff;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">
        <tr><td style="background:#6d28d9;padding:24px 24px 20px;color:#ffffff;">
          <p style="margin:0;font-size:13px;opacity:.9;">VentAlink</p>
          <h1 style="margin:8px 0 0;font-size:24px;line-height:1.25;">Tu catálogo ya está listo 🎉</h1>
        </td></tr>
        <tr><td style="padding:24px;color:#1f2937;">
          <p style="margin:0 0 14px;font-size:16px;">Hola ${escapeHtml(n)},</p>
          <p style="margin:0 0 14px;font-size:15px;line-height:1.6;">Ya llevas un día en <strong>VentAlink</strong>. Es el momento perfecto para compartir tu catálogo y empezar a recibir pedidos.</p>
          ${catalogUrl ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;"><tr><td style="border-radius:10px;background:#7c3aed;"><a href="${escapeHtml(catalogUrl)}" style="display:inline-block;padding:13px 22px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Ver mi catálogo →</a></td></tr></table>` : ''}
          <p style="margin:0 0 8px;font-size:14px;font-weight:700;color:#111827;">Copia y pega este link donde quieras:</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:12px 16px;margin:0 0 20px;word-break:break-all;"><span style="font-family:monospace;font-size:14px;color:#7c3aed;">${escapeHtml(catalogUrl)}</span></div>
          <p style="margin:0 0 6px;font-size:14px;color:#374151;line-height:1.6;">Puedes compartirlo en:</p>
          <ul style="margin:0 0 18px 18px;padding:0;font-size:14px;line-height:1.8;color:#374151;">
            <li>Tu estado de <strong>WhatsApp</strong></li>
            <li>Tu bio de <strong>Instagram</strong></li>
            <li>Grupos de clientes o comunidades</li>
            <li>Respuesta automática de WhatsApp</li>
          </ul>
          <p style="margin:0 0 6px;font-size:14px;color:#6d28d9;font-weight:700;">Muchos negocios reciben su primer pedido el mismo día que comparten el link.</p>
        </td></tr>
        <tr><td style="padding:14px 24px 20px;border-top:1px solid #ede9fe;">
          <p style="margin:0 0 6px;font-size:12px;color:#6b7280;">Walinka — Catálogo y pedidos por WhatsApp. Si necesitas ayuda, escríbenos a <a href="mailto:contacto@ventalink.app" style="color:#7c3aed;text-decoration:none;">contacto@ventalink.app</a></p>
          <p style="margin:0;font-size:11px;"><a href="mailto:contacto@ventalink.app?subject=Desuscribir" style="color:#9ca3af;text-decoration:underline;">Dejar de recibir estos correos</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
      return { subject, html };
    }
    case 'test_ping': {
      const ts = new Date().toISOString();
      const subject = `[TEST PING] Verificación de envío — VentAlink`;
      const html = `<!doctype html>
<html><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:40px auto;padding:24px;color:#1f2937;border:2px solid #7c3aed;border-radius:12px;">
  <h1 style="color:#7c3aed;margin:0 0 16px;font-size:22px;">Test Ping ✓</h1>
  <p style="margin:0 0 10px;font-size:15px;">Este es un correo de prueba enviado desde la Edge Function <strong>send-email</strong> de VentAlink.</p>
  <p style="margin:0 0 6px;font-size:13px;color:#6b7280;">Timestamp: <code>${ts}</code></p>
  <p style="margin:0;font-size:13px;color:#6b7280;">Si recibes este mensaje, el sistema de correo funciona correctamente.</p>
</body></html>`;
      return { subject, html };
    }
    default:
      throw new Error(`Unknown email type: ${type}`);
  }
}

async function logEmail(
  supabase: ReturnType<typeof createClient>,
  opts: {
    userId?: string;
    businessId?: string;
    toEmail: string;
    type: string;
    status: 'sent' | 'failed';
    providerMessageId?: string;
    errorMessage?: string;
    idempotencyKey?: string | null;
    source?: string | null;
  }
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
      idempotency_key: opts.idempotencyKey || null,
      source: opts.source || null,
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

  // QW-4: validar x-email-secret para requests no-admin.
  // Solo se aplica si EMAIL_FUNCTION_SECRET está configurado como env var en la Edge Function.
  // Mientras no esté configurado, el endpoint funciona igual que antes (sin validación adicional).
  if (action !== 'preview' && action !== 'admin_send_test') {
    const functionSecret = Deno.env.get('EMAIL_FUNCTION_SECRET') ?? '';
    if (functionSecret) {
      const requestSecret = req.headers.get('x-email-secret') ?? '';
      if (requestSecret !== functionSecret) {
        console.warn('[send-email] unauthorized: x-email-secret inválido o ausente');
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
    }
  }

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

    // admin_send_test: SIEMPRE envía al inbox de prueba, nunca al "to" del body.
    const requestedTo = typeof body?.to === 'string' ? body.to.trim() : '(no especificado)';
    const finalTo = (Deno.env.get('EMAIL_TEST_INBOX') ?? '').trim() || 'jotacegaete@gmail.com';

    console.log('[send-email] admin_send_test', { action, type: emailType, requestedTo, finalTo });

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
          to: [finalTo],
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
        console.error('[send-email] admin_send_test Resend error:', { action, type: emailType, requestedTo, finalTo, status: res.status, message });
        if (supabase) {
          await logAdminTest(supabase, {
            adminUserId: admin.userId,
            templateKey: emailType,
            toEmail: finalTo,
            subject,
            status: 'failed',
            errorMessage: message,
          });
        }
        return jsonResponse({ error: message, details: resData }, res.status >= 400 && res.status < 500 ? res.status : 500);
      }

      const providerId = (resData?.id as string) || null;
      console.log('[send-email] admin_send_test sent OK', { action, type: emailType, requestedTo, finalTo, providerId, subject: subject?.slice(0, 60) });
      if (supabase) {
        await logAdminTest(supabase, {
          adminUserId: admin.userId,
          templateKey: emailType,
          toEmail: finalTo,
          subject,
          status: 'sent',
        });
      }
      return jsonResponse({ success: true, requestedTo, finalTo, type: emailType, id: providerId }, 200);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[send-email] admin_send_test fetch error:', { action, type: emailType, requestedTo, finalTo, msg });
      if (supabase) {
        await logAdminTest(supabase, {
          adminUserId: admin.userId,
          templateKey: emailType,
          toEmail: finalTo,
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

  if (!isEmailAutomationEnabled()) {
    console.log('[send-email] skipped: EMAIL_AUTOMATION_DISABLED', {
      type: emailType || 'custom',
      source: typeof body?.source === 'string' ? body.source.trim() || null : null,
    });
    return jsonResponse({ skipped: true, reason: EMAIL_AUTOMATION_DISABLED_REASON }, 200);
  }

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
  const idempotencyKey = typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() ? body.idempotencyKey.trim() : null;
  const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : null;

  // QW-2: Guard de idempotencia en la Edge Function.
  // Si ya existe un log con esta idempotency_key, el email ya fue enviado — saltar sin error.
  if (idempotencyKey && supabase) {
    try {
      const { data: existing } = await supabase
        .from('wa_email_logs')
        .select('id, status')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (existing) {
        console.log('[send-email] idempotency hit, skipping:', { idempotencyKey, existingId: existing.id, status: existing.status });
        return jsonResponse({ success: true, skipped: true, reason: 'already_sent', idempotencyKey }, 200);
      }
    } catch (e) {
      // Si falla la consulta de idempotencia, seguir adelante (no bloquear el envío)
      console.warn('[send-email] idempotency check failed, proceeding anyway:', e);
    }
  }

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
          idempotencyKey,
          source,
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
        idempotencyKey,
        source,
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
        idempotencyKey,
        source,
      });
    }
    return jsonResponse({ error: 'Failed to send email', details: msg }, 500);
  }
});
