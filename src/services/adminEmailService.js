import { supabase } from '../lib/supabase';
import { APP_ORIGIN, getPublicCatalogUrl } from '../config/appUrl';

// ---------------------------------------------------------------------------
// Plantillas disponibles — deben coincidir con renderTemplate en send-email.
// ---------------------------------------------------------------------------
export const ADMIN_EMAIL_TEMPLATES = [
  { key: 'welcome',           label: 'Bienvenida al registro' },
  { key: 'email_confirm',     label: 'Confirmación de email' },
  { key: 'password_recovery', label: 'Recuperación de contraseña' },
  { key: 'activation_24h',    label: 'Activación a las 24h' },
  { key: 'trial_expiring',    label: 'Prueba Pro por vencer' },
  { key: 'payment_confirmed', label: 'Pago confirmado' },
  { key: 'plan_changed',      label: 'Cambio de plan' },
  { key: 'new_order',         label: 'Nuevo pedido recibido' },
  { key: 'daily_summary',     label: 'Resumen diario' },
  { key: 'weekly_summary',    label: 'Resumen semanal' },
  { key: 'test_ping',         label: 'Test Ping (verificación básica)' },
];

// ---------------------------------------------------------------------------
// Mocks razonables por plantilla.
// Los campos deben coincidir con los que consume renderTemplate.
// ---------------------------------------------------------------------------
const today = new Date().toISOString().slice(0, 10);

const TEMPLATE_MOCKS = {
  welcome: {
    user_name: 'Juan',
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  email_confirm: {
    user_name: 'Juan',
    name: 'Juan',
    confirmUrl: `${APP_ORIGIN}/auth/callback?token=mock-confirm-token`,
    confirm_url: `${APP_ORIGIN}/auth/callback?token=mock-confirm-token`,
  },
  password_recovery: {
    user_name: 'Juan',
    name: 'Juan',
    resetUrl: `${APP_ORIGIN}/auth/reset-password?token=mock-recovery-token`,
    reset_url: `${APP_ORIGIN}/auth/reset-password?token=mock-recovery-token`,
  },
  activation_24h: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    catalogUrl: `${APP_ORIGIN}/tienda-de-lola`,
    catalog_url: `${APP_ORIGIN}/tienda-de-lola`,
  },
  trial_expiring: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    daysLeft: 2,
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  payment_confirmed: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    planSlug: 'Pro',
    amount: 9990,
    currency: 'CLP',
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  plan_changed: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    oldPlan: 'Básico',
    newPlan: 'Pro',
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  new_order: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    customerName: 'María García',
    total: 15500,
    currency: 'CLP',
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  daily_summary: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    date: today,
    orderCount: 7,
    totalSold: 84300,
    currency: 'CLP',
    topProducts: [
      { name: 'Empanadas de pino (6 un)', totalQty: 12, totalRevenue: 36000 },
      { name: 'Jugo natural',             totalQty: 8,  totalRevenue: 16000 },
      { name: 'Combo familiar',           totalQty: 3,  totalRevenue: 32300 },
    ],
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  weekly_summary: {
    name: 'Juan',
    businessName: 'La Tienda de Lola',
    date: today,
    orderCount: 43,
    totalSold: 512000,
    currency: 'CLP',
    topProducts: [
      { name: 'Empanadas de pino (6 un)', totalQty: 72, totalRevenue: 216000 },
      { name: 'Jugo natural',             totalQty: 54, totalRevenue: 108000 },
      { name: 'Combo familiar',           totalQty: 18, totalRevenue: 188000 },
    ],
    dashboardUrl: `${APP_ORIGIN}/dashboard`,
  },
  test_ping: {},
};

/** Retorna los datos mock base para una plantilla dada. */
export function getMockForTemplate(templateKey) {
  return { ...(TEMPLATE_MOCKS[templateKey] ?? TEMPLATE_MOCKS.welcome) };
}

/**
 * Construye overrides reales a partir del negocio autenticado.
 * Se mezclan sobre el mock base: datos reales siempre ganan sobre los mocks.
 * Retorna {} si no hay negocio disponible (fallback transparente a mocks).
 *
 * @param {object|null} business  — objeto business del contexto de auth
 * @returns {Record<string, string>}
 */
export function buildBusinessOverrides(business) {
  if (!business) return {};
  const name = String(business.name || '').trim();
  const slug = String(business.slug || '').trim();
  const catalogUrl = slug ? getPublicCatalogUrl(slug) : '';
  const dashboardUrl = `${APP_ORIGIN}/dashboard`;
  return {
    ...(name ? { name, businessName: name } : {}),
    ...(catalogUrl ? { catalogUrl, catalog_url: catalogUrl } : {}),
    dashboardUrl,
    dashboard_url: dashboardUrl,
  };
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------
function getSupabaseUrlAndKey() {
  const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
  const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
  return { supabaseUrl, anonKey };
}

async function getSessionToken() {
  const { data: { session } } = await supabase?.auth?.getSession() ?? { data: { session: null } };
  return session?.access_token ?? null;
}

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

// ---------------------------------------------------------------------------
// API pública
// ---------------------------------------------------------------------------

/**
 * Preview HTML renderizado en servidor (solo admin; valida JWT en Edge Function).
 * @param {string} templateKey
 * @param {Record<string,unknown>} dataOverrides  — sobreescribe o extiende el mock base
 */
export async function fetchAdminEmailPreview(templateKey, dataOverrides = {}) {
  const { supabaseUrl, anonKey } = getSupabaseUrlAndKey();
  const token = await getSessionToken();
  if (!supabaseUrl || !anonKey || !token) {
    return { data: null, error: { message: 'Sesión o configuración no disponible' } };
  }
  const mockData = { ...getMockForTemplate(templateKey), ...dataOverrides };
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
        data: mockData,
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
 * El backend SIEMPRE redirige a EMAIL_TEST_INBOX; el campo `to` es solo informativo.
 * @param {string} templateKey
 * @param {string} toEmail       — se manda en body pero el backend lo ignora para el envío real
 * @param {Record<string,unknown>} dataOverrides
 */
export async function sendAdminEmailTest(templateKey, toEmail, dataOverrides = {}) {
  const { supabaseUrl, anonKey } = getSupabaseUrlAndKey();
  const token = await getSessionToken();
  if (!supabaseUrl || !anonKey || !token) {
    return { data: null, error: { message: 'Sesión o configuración no disponible' } };
  }
  const to = (toEmail || '').trim();
  if (!to) return { data: null, error: { message: 'Email destino requerido' } };
  const mockData = { ...getMockForTemplate(templateKey), ...dataOverrides };
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
        data: mockData,
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
