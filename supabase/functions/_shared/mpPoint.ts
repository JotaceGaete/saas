// Shared server-side helpers for Mercado Pago Point (POINT-SMART-2).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from './supabasePublishableKey.ts';
import { getSupabaseAdminKeyOrEmpty } from './supabaseAdminKey.ts';

export const MP_ORDERS_URL = 'https://api.mercadopago.com/v1/orders';
export const MP_TERMINALS_URL = 'https://api.mercadopago.com/terminals/v1/list';

export const pointCorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function pointJson(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...pointCorsHeaders, 'Content-Type': 'application/json' },
  });
}

export function isMpTokenExpired(expiresAt: unknown): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= Date.now();
}

export function pointCurrency(countryCode: unknown): 'CLP' | 'ARS' | null {
  const code = typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
  if (code === 'CL') return 'CLP';
  if (code === 'AR') return 'ARS';
  return null;
}

export async function resolvePointContext(authHeader: string) {
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return { ok: false as const, response: pointJson({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401) };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = getSupabaseAdminKeyOrEmpty();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false as const, response: pointJson({ error: 'Server configuration error' }, 500) };
  }

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: userData } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    return { ok: false as const, response: pointJson({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401) };
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await admin
    .from('wa_businesses')
    .select('id, country_code')
    .eq('user_id', user.id);

  if (bizError) return { ok: false as const, response: pointJson({ error: 'Business lookup failed' }, 500) };
  if (!businesses || businesses.length === 0) return { ok: false as const, response: pointJson({ error: 'Business not found', reason: 'no_business' }, 404) };
  if (businesses.length !== 1) return { ok: false as const, response: pointJson({ error: 'Business resolution ambiguous', reason: 'multiple_businesses' }, 409) };

  const business = businesses[0];
  const currency = pointCurrency(business.country_code);
  if (!currency) return { ok: false as const, response: pointJson({ error: 'Mercado Pago Point not supported for country', reason: 'MP_COUNTRY_NOT_SUPPORTED' }, 422) };

  const { data: rows, error: connError } = await admin.rpc('wa_get_mp_point_connection', { p_business_id: business.id });
  if (connError) return { ok: false as const, response: pointJson({ error: 'Server configuration error' }, 500) };
  const connection = Array.isArray(rows) ? rows[0] : null;
  if (!connection?.access_token) return { ok: false as const, response: pointJson({ error: 'Mercado Pago not connected', reason: 'MP_POINT_NOT_CONNECTED' }, 409) };
  if (isMpTokenExpired(connection.token_expires_at)) return { ok: false as const, response: pointJson({ error: 'Mercado Pago connection expired', reason: 'MP_POINT_CONNECTION_EXPIRED' }, 409) };

  return {
    ok: true as const,
    admin,
    userId: user.id as string,
    businessId: business.id as string,
    currency,
    accessToken: connection.access_token as string,
  };
}

export type SanitizedPointOrder = {
  id: string | null;
  external_reference: string | null;
  status: string | null;
  status_detail: string | null;
  payment_id: string | null;
  payment_status: string | null;
  payment_status_detail: string | null;
  amount: string | null;
};

function str(v: unknown): string | null {
  return typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;
}

export function sanitizePointOrder(raw: unknown): SanitizedPointOrder {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const tx = (o.transactions && typeof o.transactions === 'object' ? o.transactions : {}) as Record<string, unknown>;
  const payments = Array.isArray(tx.payments) ? tx.payments : [];
  const p = (payments[0] && typeof payments[0] === 'object' ? payments[0] : {}) as Record<string, unknown>;
  return {
    id: str(o.id),
    external_reference: str(o.external_reference),
    status: str(o.status),
    status_detail: str(o.status_detail),
    payment_id: str(p.id),
    payment_status: str(p.status),
    payment_status_detail: str(p.status_detail),
    amount: str(p.amount),
  };
}

export const MP_FINAL_STATUSES = new Set(['processed', 'failed', 'expired', 'canceled', 'refunded', 'action_required']);
export const MP_ALLOWED_STATUSES = new Set(['created', 'at_terminal', ...MP_FINAL_STATUSES]);
