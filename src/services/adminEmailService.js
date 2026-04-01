import { supabase } from '../lib/supabase';
import { APP_ORIGIN } from '../config/appUrl';

const MOCK_DEFAULTS = {
  user_name: 'Juan',
  name: 'Juan',
  business_name: 'La Tienda de Lola',
  businessName: 'La Tienda de Lola',
  dashboard_url: `${APP_ORIGIN}/dashboard`,
  dashboardUrl: `${APP_ORIGIN}/dashboard`,
  confirm_url: `${APP_ORIGIN}/auth/callback?token=mock-confirm-token`,
  confirmUrl: `${APP_ORIGIN}/auth/callback?token=mock-confirm-token`,
  reset_url: `${APP_ORIGIN}/auth/reset-password?token=mock-recovery-token`,
  resetUrl: `${APP_ORIGIN}/auth/reset-password?token=mock-recovery-token`,
};

/**
 * Plantillas disponibles para preview / prueba en admin (deben existir en send-email renderTemplate).
 */
export const ADMIN_EMAIL_TEMPLATES = [
  { key: 'welcome', label: 'Bienvenida' },
  { key: 'email_confirm', label: 'Confirmación de email' },
  { key: 'password_recovery', label: 'Recuperación de contraseña' },
];

function getSupabaseUrlAndKey() {
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  return { supabaseUrl, anonKey };
}

async function getSessionToken() {
  const { data: { session } } = await supabase?.auth?.getSession() ?? { data: { session: null } };
  return session?.access_token ?? null;
}

/** Extrae mensaje legible del JSON de la Edge Function / Resend */
function parseEdgeFunctionError(body) {
  if (!body || typeof body !== 'object') return 'Error desconocido';
  if (typeof body.error === 'string' && body.error.trim()) return body.error.trim();
  if (body.error && typeof body.error === 'object' && body.error.message) return String(body.error.message);
  const d = body.details;
  if (d && typeof d === 'object') {
    if (typeof d.message === 'string') return d.message;
    if (Array.isArray(d.errors) && d.errors[0]?.message) return String(d.errors[0].message);
  }
  if (typeof d === 'string' && d.trim()) return d.trim();
  return 'Error al enviar el correo';
}

/**
 * Preview HTML renderizado en servidor (solo admin; valida JWT en Edge Function).
 */
export async function fetchAdminEmailPreview(templateKey, dataOverrides = {}) {
  const { supabaseUrl, anonKey } = getSupabaseUrlAndKey();
  const token = await getSessionToken();
  if (!supabaseUrl || !anonKey || !token) {
    return { data: null, error: { message: 'Sesión o configuración no disponible' } };
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        action: 'preview',
        type: templateKey,
        data: { ...MOCK_DEFAULTS, ...dataOverrides },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: { message: parseEdgeFunctionError(body), raw: body } };
    return {
      data: {
        subject: body?.subject ?? '',
        html: body?.html ?? '',
        type: body?.type ?? templateKey,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: { message: err?.message || 'Network error' } };
  }
}

/**
 * Envía email de prueba con datos mock (solo admin).
 */
export async function sendAdminEmailTest(templateKey, toEmail, dataOverrides = {}) {
  const { supabaseUrl, anonKey } = getSupabaseUrlAndKey();
  const token = await getSessionToken();
  if (!supabaseUrl || !anonKey || !token) {
    return { data: null, error: { message: 'Sesión o configuración no disponible' } };
  }
  const to = (toEmail || '').trim();
  if (!to) return { data: null, error: { message: 'Email destino requerido' } };
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        apikey: anonKey,
      },
      body: JSON.stringify({
        action: 'admin_send_test',
        to,
        type: templateKey,
        data: { ...MOCK_DEFAULTS, ...dataOverrides },
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: { message: parseEdgeFunctionError(body), raw: body, status: res.status } };
    return { data: body, error: null };
  } catch (err) {
    return { data: null, error: { message: err?.message || 'Network error' } };
  }
}

/**
 * Historial de pruebas (RLS: solo admin).
 */
export async function getAdminEmailTestLogs(limit = 50) {
  const { data, error } = await supabase
    .from('wa_admin_email_test_logs')
    .select('id, template_key, to_email, subject, status, error_message, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return { data: null, error };
  return { data: data || [], error: null };
}

export function getAdminEmailMockDefaults() {
  return { ...MOCK_DEFAULTS };
}
