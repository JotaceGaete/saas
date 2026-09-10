// mp-oauth-start — MP-OAUTH-1.
// Genera un intento de conexión OAuth (Authorization Code + PKCE S256)
// para que el DUEÑO del negocio autenticado conecte SU PROPIA cuenta de
// Mercado Pago. Completamente aislado del Mercado Pago de billing de
// plataforma (create-mp-preference/mp-webhook): no los importa, no lee
// MP_ACCESS_TOKEN_*, no toca wa_payments/billing_subscriptions.
//
// Seguridad: negocio resuelto 100% por SERVICE_ROLE + auth.uid(). No
// acepta businessId del frontend (mismo patrón que create-mp-preference).
//
// Nunca devuelve code_verifier, tokens ni ningún secreto -- únicamente
// { authorizationUrl }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getSupabasePublishableKeyOrEmpty } from '../_shared/supabasePublishableKey.ts';
import {
  generateCodeVerifier,
  generateState,
  generateCodeChallenge,
  hashState,
  buildAuthorizationUrl,
  resolveBusinessForOAuth,
  type BusinessRow,
} from './lib.ts';

const MP_AUTHORIZATION_BASE_URL = 'https://auth.mercadopago.com/authorization';
const STATE_TTL_SECONDS = 600; // 10 minutos

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

const RESOLUTION_STATUS: Record<string, number> = {
  no_business: 404,
  multiple_businesses: 409,
  ownership_mismatch: 403,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  const authHeader = (req.headers.get('authorization') ?? '').trim();
  if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
    return jsonResponse({ error: 'User not authenticated', reason: 'missing_or_invalid_header' }, 401);
  }

  const supabaseUrl    = Deno.env.get('SUPABASE_URL')              ?? '';
  const anonKey        = getSupabasePublishableKeyOrEmpty();
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const mpClientId     = Deno.env.get('MP_CLIENT_ID')              ?? '';
  const redirectUri    = Deno.env.get('MP_OAUTH_REDIRECT_URI')     ?? '';

  if (!serviceRoleKey || !mpClientId || !redirectUri) {
    console.error('[mp-oauth-start] server configuration missing (SUPABASE_SERVICE_ROLE_KEY / MP_CLIENT_ID / MP_OAUTH_REDIRECT_URI)');
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // ── 1. Validar usuario desde el JWT ────────────────────────────────────────
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  const user = userData?.user ?? null;
  if (!user?.id) {
    console.log('[mp-oauth-start] 401: JWT inválido', userError?.message);
    return jsonResponse({ error: 'User not authenticated', reason: 'invalid_jwt' }, 401);
  }

  // ── 2. Parsear body — businessId ignorado explícitamente ──────────────────
  let body: Record<string, unknown> = {};
  try { body = (await req.json().catch(() => ({}))) as Record<string, unknown>; } catch { body = {}; }
  if (body?.businessId) {
    console.warn('[mp-oauth-start] businessId en body IGNORADO — se resuelve solo por auth.uid()');
  }

  // ── 3. Resolver negocio con SERVICE_ROLE (sin RLS, sin ambigüedad) ─────────
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: businesses, error: bizError } = await adminClient
    .from('wa_businesses')
    .select('id, user_id')
    .eq('user_id', user.id);

  if (bizError) {
    console.error('[mp-oauth-start] error query wa_businesses:', bizError.message);
    return jsonResponse({ error: 'Business not found for user' }, 404);
  }

  const resolution = resolveBusinessForOAuth((businesses ?? []) as BusinessRow[], user.id);
  if (!resolution.ok) {
    console.error('[mp-oauth-start] business resolution failed:', resolution.reason);
    return jsonResponse(
      { error: 'Business not found for user', reason: resolution.reason },
      RESOLUTION_STATUS[resolution.reason] ?? 400,
    );
  }
  const business = resolution.business;

  // ── 4. Generar state + PKCE ─────────────────────────────────────────────────
  const state        = generateState();
  const codeVerifier  = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const stateHash     = await hashState(state);

  // ── 5. Persistir el intento (code_verifier cifrado dentro de la RPC — nunca
  //      en este proceso). TTL 10 min, single-use (ver wa_consume_mp_oauth_state).
  const { error: stateError } = await adminClient.rpc('wa_create_mp_oauth_state', {
    p_business_id: business.id,
    p_user_id: user.id,
    p_state_hash: stateHash,
    p_code_verifier: codeVerifier,
    p_ttl_seconds: STATE_TTL_SECONDS,
  });

  if (stateError) {
    console.error('[mp-oauth-start] error creando mp_oauth_state:', stateError.message);
    return jsonResponse({ error: 'Server configuration error' }, 500);
  }

  // ── 6. Construir URL de autorización de Mercado Pago ───────────────────────
  const authorizationUrl = buildAuthorizationUrl({
    authBaseUrl: MP_AUTHORIZATION_BASE_URL,
    clientId: mpClientId,
    redirectUri,
    state,
    codeChallenge,
  });

  console.log('[mp-oauth-start] authorization_url_created', { businessId: business.id });

  // Respuesta mínima: nunca code_verifier, nunca tokens, nunca client_secret.
  return jsonResponse({ authorizationUrl }, 200);
});
