// mp-point-terminals — MP-POINT-0.
// Auditoría/diagnóstico: determina si la cuenta de Mercado Pago
// CONECTADA (OAuth, MP-OAUTH-1) del negocio del usuario autenticado
// tiene alguna terminal Point registrada, vía
// GET https://api.mercadopago.com/terminals/v1/list.
//
// Alcance explícito de esta fase: SOLO lectura. No crea órdenes, no
// cambia operating_mode, no hace ningún cobro. No modifica el flujo
// OAuth existente -- reutiliza tal cual wa_get_mp_connection_for_checkout
// (ya creada en MP-CHECKOUT-1) para obtener el access_token descifrado
// server-side; no se agrega ninguna migración nueva.
//
// El access_token NUNCA se devuelve al frontend ni se loguea completo --
// solo se usa en el Authorization header del fetch a Mercado Pago,
// dentro de esta función.
//
// Mismo patrón de autenticación que mp-oauth-disconnect: JWT del
// usuario validado acá mismo (verify_jwt=false en config.toml, mismo
// motivo de siempre -- CORS preflight OPTIONS no trae Authorization),
// negocio resuelto EXCLUSIVAMENTE por auth.uid() vía service_role
// (resolveBusinessForOAuth, reutilizada de mp-oauth-start/lib.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import { resolveBusinessForOAuth, type BusinessRow } from '../mp-oauth-start/lib.ts';
import { isTokenExpired } from '../create-merchant-mp-checkout/lib.ts';
import { parseTerminalsListResponse } from './lib.ts';

const MP_TERMINALS_URL = 'https://api.mercadopago.com/terminals/v1/list?limit=50&offset=0';

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

function errorResponse(error: string, reason: string, status: number) {
  return jsonResponse({ error, reason }, status);
}

const RESOLUTION_STATUS: Record<string, number> = {
  no_business: 404,
  multiple_businesses: 409,
  ownership_mismatch: 403,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('Method not allowed', 'INVALID_REQUEST', 405);
  }

  // ── 1. Validar usuario desde el JWT (mismo patrón que mp-oauth-disconnect) ──
  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey        = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!serviceRoleKey) {
    console.error('[mp-point-terminals] SUPABASE_SERVICE_ROLE_KEY not set');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.log('[mp-point-terminals] 401: JWT inválido', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }

  // ── 2. businessId del body (si viniera) IGNORADO explícitamente -- mismo
  //      criterio que mp-oauth-disconnect: el negocio SIEMPRE sale de
  //      auth.uid(), nunca de lo que envíe el cliente ─────────────────────
  let body: Record<string, unknown> = {};
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { body = {}; }
  if (body?.businessId) {
    console.warn('[mp-point-terminals] businessId en body IGNORADO — se resuelve solo por auth.uid()');
  }

  // ── 3. Resolver negocio con SERVICE_ROLE (sin RLS, sin ambigüedad) ───────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id')
    .eq('user_id', user.id);

  if (bizError) {
    console.error('[mp-point-terminals] error query wa_businesses:', bizError.message);
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }

  const resolution = resolveBusinessForOAuth((businesses ?? []) as BusinessRow[], user.id);
  if (!resolution.ok) {
    console.error('[mp-point-terminals] business resolution failed:', resolution.reason);
    return jsonResponse(
      { error: 'Business not found for user', reason: resolution.reason },
      RESOLUTION_STATUS[resolution.reason] ?? 400,
    );
  }
  const business = resolution.business;

  // ── 4. Conexión Mercado Pago DEL COMERCIO -- reutiliza tal cual la RPC de
  //      MP-CHECKOUT-1, sin tocar el flujo OAuth ni agregar una nueva ──────
  const { data: connectionRows, error: connError } = await adminClient.rpc('wa_get_mp_connection_for_checkout', {
    p_business_id: business.id,
  });

  if (connError) {
    console.error('[mp-point-terminals] error consultando mp_connection:', connError.message);
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  const connection = Array.isArray(connectionRows) ? connectionRows[0] : null;
  if (!connection) {
    return errorResponse('Este negocio no tiene Mercado Pago conectado', 'MP_NOT_CONNECTED', 409);
  }
  if (isTokenExpired(connection.token_expires_at as string | null)) {
    console.warn('[mp-point-terminals] token MP expirado (sin refresh automático todavía)', { businessId: business.id });
    return errorResponse('La conexión de Mercado Pago expiró. Reconéctala para poder buscar terminales.', 'MP_CONNECTION_EXPIRED', 409);
  }
  const mpAccessToken = connection.access_token as string;

  // ── 5. GET /terminals/v1/list -- token DEL COMERCIO, nunca uno de plataforma ──
  let mpRes: Response;
  try {
    mpRes = await fetch(MP_TERMINALS_URL, {
      headers: { Authorization: `Bearer ${mpAccessToken}` },
    });
  } catch (err) {
    console.error('[mp-point-terminals] fetch a terminals/v1/list falló:', (err as Error)?.message, { businessId: business.id });
    return errorResponse('No se pudo contactar a Mercado Pago', 'MP_REQUEST_FAILED', 502);
  }

  const bodyText = await mpRes.text();

  if (mpRes.status === 401) {
    console.warn('[mp-point-terminals] MP respondió 401 (token rechazado)', { businessId: business.id });
    return errorResponse('Mercado Pago rechazó el token de esta conexión (vencido o inválido).', 'MP_TOKEN_REJECTED', 409);
  }
  if (mpRes.status === 403) {
    console.warn('[mp-point-terminals] MP respondió 403 (sin permiso)', { businessId: business.id });
    return errorResponse('La cuenta de Mercado Pago conectada no tiene permiso para listar terminales.', 'MP_FORBIDDEN', 409);
  }
  if (!mpRes.ok) {
    console.error('[mp-point-terminals] MP respondió error, status:', mpRes.status, { businessId: business.id });
    return errorResponse('Mercado Pago devolvió un error inesperado.', 'MP_UNEXPECTED_ERROR', 502);
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(bodyText);
  } catch {
    console.error('[mp-point-terminals] respuesta de MP no es JSON válido', { businessId: business.id });
    return errorResponse('Mercado Pago devolvió una respuesta inesperada.', 'MP_UNEXPECTED_RESPONSE', 502);
  }

  // ── 6. MP-POINT-0 -- diagnóstico explícito pedido por el ticket: registrar
  //      la ESTRUCTURA real de la respuesta (nunca el token, nunca nada del
  //      lado sensible) para poder confirmar contra el hardware físico
  //      (PAX A910) qué forma/campos devuelve Mercado Pago de verdad, sin
  //      asumirlo de antemano. `rawSample` se trunca y esto NUNCA incluye
  //      encabezados ni el access_token -- solo el body ya parseado que MP
  //      mismo documenta como público para el dueño de la cuenta.
  const topLevelKeys = (parsedBody && typeof parsedBody === 'object') ? Object.keys(parsedBody as object) : [];
  console.log('[mp-point-terminals] respuesta estructural de MP /terminals/v1/list', {
    businessId: business.id,
    topLevelKeys,
    rawSample: JSON.stringify(parsedBody).slice(0, 2000),
  });

  const { terminals, total } = parseTerminalsListResponse(parsedBody);

  return jsonResponse({ ok: true, terminals, total }, 200);
});
