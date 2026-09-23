// mp-point-terminals — POINT-SMART-2-4A.
// Lista las terminales Point activas de la cuenta Mercado Pago conectada
// al negocio autenticado. Solo lectura: NO cambia operating_mode, NO crea
// orders, NO toca caja/stock/ventas.
//
// Seguridad:
// - verify_jwt=false solo para permitir CORS preflight; el JWT real se valida
//   dentro con auth.getUser(), igual que mp-oauth-start.
// - businessId del body se ignora: business_id se resuelve por auth.uid().
// - access_token se obtiene server-side desde la conexión OAuth cifrada y
//   nunca se devuelve al navegador.
// - la respuesta de Mercado Pago se reduce a campos no sensibles necesarios
//   para seleccionar/configurar la terminal.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { getSupabaseAdminKeyOrEmpty } from '../_shared/supabaseAdminKey.ts';

const MP_TERMINALS_URL = 'https://api.mercadopago.com/terminals/v1/list';

const corsHeaders = {
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

type MpTerminal = {
  id?: unknown;
  pos_id?: unknown;
  store_id?: unknown;
  external_pos_id?: unknown;
  operating_mode?: unknown;
};

function safeString(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function isExpired(expiresAt: unknown): boolean {
  if (typeof expiresAt !== 'string' || !expiresAt) return false;
  const ms = Date.parse(expiresAt);
  return Number.isFinite(ms) && ms <= Date.now();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', reason: 'INVALID_REQUEST' }, 405);
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = getSupabaseAdminKeyOrEmpty();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error('[mp-point-terminals] server configuration missing');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // 1. JWT como autoridad de identidad.
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.warn('[mp-point-terminals] invalid JWT', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }

  // 2. El body no tiene autoridad sobre tenant. Se acepta vacío para que la
  //    API pueda ampliarse más adelante sin cambiar el contrato HTTP.
  let body: Record<string, unknown> = {};
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { body = {}; }
  if (body.businessId !== undefined) {
    console.warn('[mp-point-terminals] businessId en body IGNORADO');
  }

  // 3. Resolver exactamente un negocio del usuario, mismo criterio estricto
  //    que MP OAuth. No elegir silenciosamente entre múltiples negocios.
  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await admin
    .from('wa_businesses')
    .select('id')
    .eq('user_id', user.id);

  if (bizError) {
    console.error('[mp-point-terminals] business lookup failed:', bizError.message);
    return jsonResponse({ error: 'Business lookup failed' }, 500);
  }
  if (!businesses || businesses.length === 0) {
    return jsonResponse({ error: 'Business not found', reason: 'no_business' }, 404);
  }
  if (businesses.length !== 1) {
    return jsonResponse({ error: 'Business resolution ambiguous', reason: 'multiple_businesses' }, 409);
  }
  const businessId = businesses[0].id as string;

  // 4. Token OAuth DEL COMERCIO, descifrado únicamente dentro de la RPC
  //    service_role existente. Nunca usar MP_ACCESS_TOKEN_CL/AR.
  const { data: rows, error: connError } = await admin.rpc('wa_get_mp_connection_for_checkout', {
    p_business_id: businessId,
  });
  if (connError) {
    console.error('[mp-point-terminals] mp connection lookup failed:', connError.message, { businessId });
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }
  const connection = Array.isArray(rows) ? rows[0] : null;
  if (!connection || typeof connection.access_token !== 'string' || !connection.access_token) {
    return jsonResponse({ error: 'Mercado Pago not connected', reason: 'MP_NOT_CONNECTED' }, 409);
  }
  if (isExpired(connection.token_expires_at)) {
    return jsonResponse({ error: 'Mercado Pago connection expired', reason: 'MP_CONNECTION_EXPIRED' }, 409);
  }

  // 5. Orders API actual: GET /terminals/v1/list. Sin filtros en 2-4A:
  //    queremos descubrir todas las terminales activas de la cuenta.
  let mpRes: Response;
  try {
    mpRes = await fetch(`${MP_TERMINALS_URL}?limit=50&offset=0`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${connection.access_token}`,
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    console.error('[mp-point-terminals] Mercado Pago network error:', (err as Error)?.message, { businessId });
    return jsonResponse({ error: 'Mercado Pago unavailable', reason: 'MP_TERMINALS_UNAVAILABLE' }, 502);
  }

  const raw = await mpRes.text();
  if (!mpRes.ok) {
    // No loguear body crudo: el status basta para diagnóstico y evita
    // propagar/registrar datos que Mercado Pago pudiera incluir.
    console.error('[mp-point-terminals] Mercado Pago error status:', mpRes.status, { businessId });
    if (mpRes.status === 401) {
      return jsonResponse({ error: 'Mercado Pago connection unauthorized', reason: 'MP_CONNECTION_UNAUTHORIZED' }, 409);
    }
    return jsonResponse({ error: 'Could not list Point terminals', reason: 'MP_TERMINALS_FAILED' }, 502);
  }

  let payload: { data?: { terminals?: MpTerminal[] }; paging?: { total?: unknown; offset?: unknown; limit?: unknown } };
  try {
    payload = JSON.parse(raw);
  } catch {
    console.error('[mp-point-terminals] invalid JSON from Mercado Pago', { businessId });
    return jsonResponse({ error: 'Invalid Mercado Pago response', reason: 'MP_TERMINALS_FAILED' }, 502);
  }

  const source = Array.isArray(payload?.data?.terminals) ? payload.data.terminals : [];
  const terminals = source
    .map((terminal) => ({
      id: safeString(terminal.id),
      pos_id: safeString(terminal.pos_id),
      store_id: safeString(terminal.store_id),
      external_pos_id: safeString(terminal.external_pos_id),
      operating_mode: safeString(terminal.operating_mode) ?? 'UNDEFINED',
    }))
    .filter((terminal) => !!terminal.id);

  console.log('[mp-point-terminals] terminals_listed', {
    businessId,
    count: terminals.length,
  });

  return jsonResponse({
    ok: true,
    terminals,
    paging: {
      total: Number(payload?.paging?.total ?? terminals.length),
      offset: Number(payload?.paging?.offset ?? 0),
      limit: Number(payload?.paging?.limit ?? 50),
    },
  }, 200);
});
