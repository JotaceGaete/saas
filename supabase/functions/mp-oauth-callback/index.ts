// mp-oauth-callback — MP-OAUTH-1.
// Callback público de Mercado Pago tras la autorización del dueño del
// negocio. Público a propósito (verify_jwt=false en config.toml, mismo
// motivo que mp-webhook): Mercado Pago redirige el browser acá SIN JWT
// de Walinka. Aislado del billing de plataforma: no importa ni toca
// create-mp-preference, mp-webhook, wa_payments ni billing_subscriptions.
//
// Nunca envía tokens al browser: la única respuesta posible es un
// redirect 302 a Configuración → Pagos, con únicamente
// ?tab=mercadopago&mp=connected|error -- nada sensible en la URL.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getMpOauthCredentials } from '../_shared/mpOauthCredentials.ts';
import {
  hashState,
  buildTokenExchangeBody,
  parseMpTokenResponse,
  buildCallbackRedirectUrl,
} from './lib.ts';

const MP_TOKEN_URL = 'https://api.mercadopago.com/oauth/token';
const DEFAULT_APP_RETURN_URL = 'https://go.ventalink.app';

function redirectResponse(location: string) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

Deno.serve(async (req) => {
  const reqUrl = new URL(req.url);
  const code    = reqUrl.searchParams.get('code');
  const state   = reqUrl.searchParams.get('state');
  const mpError = reqUrl.searchParams.get('error'); // callback de error estándar OAuth2

  const supabaseUrl      = Deno.env.get('SUPABASE_URL')              ?? '';
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const redirectUri      = Deno.env.get('MP_OAUTH_REDIRECT_URI')     ?? '';
  const appReturnBaseUrl = Deno.env.get('MP_OAUTH_APP_RETURN_URL')   ?? DEFAULT_APP_RETURN_URL;

  if (!serviceRoleKey || !redirectUri) {
    console.error('[mp-oauth-callback] server configuration missing (service role / MP_OAUTH_REDIRECT_URI)');
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  const db = createClient(supabaseUrl, serviceRoleKey);

  if (mpError) {
    console.warn('[mp-oauth-callback] mercado pago devolvió error en el callback:', mpError);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  if (!code || !state) {
    console.warn('[mp-oauth-callback] callback sin code o sin state');
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  // ── 1-5. Hashear y consumir el state de forma ATÓMICA (single-use) ─────────
  // wa_consume_mp_oauth_state hace el UPDATE condicionado dentro de Postgres
  // -- ver migración para el detalle de por qué esto es seguro bajo
  // concurrencia sin necesitar un lock explícito acá.
  const stateHash = await hashState(state);
  const { data: consumedRows, error: consumeError } = await db.rpc('wa_consume_mp_oauth_state', {
    p_state_hash: stateHash,
  });

  if (consumeError) {
    console.error('[mp-oauth-callback] error consumiendo state:', consumeError.message);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  const consumed = Array.isArray(consumedRows) ? consumedRows[0] : null;
  if (!consumed) {
    // Inexistente, expirado o ya consumido -- tratados igual a propósito
    // (no dar oráculo de cuál fue la razón exacta).
    console.warn('[mp-oauth-callback] state inválido (inexistente / expirado / ya consumido)');
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  const businessId   = consumed.business_id as string;
  const codeVerifier = consumed.code_verifier as string;

  // ── 6b. Seleccionar credenciales MP por país -- derivado del NEGOCIO
  //       asociado al state ya consumido, nunca de un valor recibido del
  //       browser (el callback no recibe ni lee ningún parámetro de país).
  const { data: bizRow, error: bizError } = await db
    .from('wa_businesses')
    .select('country_code')
    .eq('id', businessId)
    .maybeSingle();

  if (bizError) {
    console.error('[mp-oauth-callback] error consultando country_code del negocio:', bizError.message);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  const credentialsResult = getMpOauthCredentials(bizRow?.country_code ?? null);
  if (!credentialsResult.ok) {
    console.warn('[mp-oauth-callback] país no disponible para MP-OAUTH', {
      businessId,
      reason: credentialsResult.reason,
    });
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }
  const { clientId: mpClientId, clientSecret: mpClientSecret } = credentialsResult.credentials;

  // ── 7. Intercambiar code por tokens — solo los parámetros documentados ─────
  const tokenBody = buildTokenExchangeBody({
    clientId: mpClientId,
    clientSecret: mpClientSecret,
    code,
    redirectUri,
    codeVerifier,
  });

  let mpRes: Response;
  try {
    mpRes = await fetch(MP_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokenBody),
    });
  } catch (err) {
    console.error('[mp-oauth-callback] fetch a oauth/token falló:', (err as Error)?.message);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  const mpBodyText = await mpRes.text();
  if (!mpRes.ok) {
    // Solo el status -- nunca el body completo (podría ecoar parámetros
    // enviados, incluido client_secret, en la respuesta de error de MP).
    console.error('[mp-oauth-callback] MP oauth/token respondió error, status:', mpRes.status);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  let mpJson: Record<string, unknown>;
  try { mpJson = JSON.parse(mpBodyText); }
  catch {
    console.error('[mp-oauth-callback] respuesta de MP no es JSON válido');
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  const parsed = parseMpTokenResponse(mpJson);
  if (!parsed.ok) {
    console.error('[mp-oauth-callback] respuesta de MP sin access_token:', parsed.reason);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  // ── 8. Guardar la conexión — el cifrado ocurre DENTRO de esta RPC ──────────
  const { error: upsertError } = await db.rpc('wa_upsert_mp_connection', {
    p_business_id: businessId,
    p_provider_user_id: parsed.token.providerUserId,
    p_access_token: parsed.token.accessToken,
    p_refresh_token: parsed.token.refreshToken,
    p_expires_in_seconds: parsed.token.expiresInSeconds,
    p_scope: parsed.token.scope,
    p_live_mode: parsed.token.liveMode,
  });

  if (upsertError) {
    console.error('[mp-oauth-callback] error guardando mp_connections:', upsertError.message);
    return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'error' }));
  }

  console.log('[mp-oauth-callback] mp_connection_created', { businessId });

  // ── 9-10. Nunca tokens al browser — únicamente redirect ─────────────────────
  return redirectResponse(buildCallbackRedirectUrl({ appReturnBaseUrl, status: 'connected' }));
});
