/**
 * mp-oauth-callback/lib.ts
 * Funciones puras (parseo/validación/construcción de URLs, sin I/O) para
 * poder testearlas en Vitest/Node -- mismo criterio que mp-webhook/lib.ts.
 *
 * El cifrado/descifrado real de tokens y code_verifier ocurre exclusivamente
 * dentro de Postgres (wa_consume_mp_oauth_state / wa_upsert_mp_connection,
 * ver migración) -- este archivo nunca cifra ni descifra nada, y ninguna de
 * sus funciones recibe ni devuelve un token en un contexto que pueda llegar
 * al browser (redirects y logs solo usan lo que estas funciones exponen).
 */

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 (hex) del state -- debe producir EXACTAMENTE el mismo resultado
 * que hashState() en mp-oauth-start/lib.ts para el mismo input (el lookup
 * en mp_oauth_states depende de esa igualdad). Duplicada a propósito
 * (Edge Functions se despliegan como unidades independientes, mismo
 * criterio que corsHeaders repetido en cada función de este repo) --
 * cubierta por un test de consistencia cruzada.
 */
export async function hashState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return toHex(new Uint8Array(digest));
}

export interface BuildTokenExchangeBodyInput {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}

/**
 * Body exacto para POST https://api.mercadopago.com/oauth/token
 * (Authorization Code + PKCE, documentación oficial de Mercado Pago):
 * client_id, client_secret, grant_type=authorization_code, code,
 * redirect_uri, code_verifier. Ningún parámetro fuera de estos 6.
 */
export function buildTokenExchangeBody({
  clientId,
  clientSecret,
  code,
  redirectUri,
  codeVerifier,
}: BuildTokenExchangeBodyInput): Record<string, string> {
  return {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  };
}

export interface MpTokenResponseRaw {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
  scope?: unknown;
  user_id?: unknown;
  live_mode?: unknown;
}

export interface ParsedMpTokenResponse {
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number | null;
  scope: string | null;
  providerUserId: string | null;
  liveMode: boolean | null;
}

export type ParseMpTokenResponseResult =
  | { ok: true; token: ParsedMpTokenResponse }
  | { ok: false; reason: 'missing_access_token' };

/**
 * Valida y normaliza la respuesta de POST /oauth/token. access_token es lo
 * único estrictamente requerido. El resto se persiste tal cual venga, o
 * `null` si la API no lo incluyó en esta respuesta -- en particular
 * live_mode NUNCA se infiere ni se inventa (requisito explícito del
 * ticket): si MP no lo manda, queda NULL, no false.
 */
export function parseMpTokenResponse(raw: MpTokenResponseRaw): ParseMpTokenResponseResult {
  if (typeof raw?.access_token !== 'string' || raw.access_token.trim() === '') {
    return { ok: false, reason: 'missing_access_token' };
  }
  return {
    ok: true,
    token: {
      accessToken: raw.access_token,
      refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : null,
      expiresInSeconds: typeof raw.expires_in === 'number' ? raw.expires_in : null,
      scope: typeof raw.scope === 'string' ? raw.scope : null,
      providerUserId: raw.user_id === undefined || raw.user_id === null ? null : String(raw.user_id),
      liveMode: typeof raw.live_mode === 'boolean' ? raw.live_mode : null,
    },
  };
}

export type CallbackRedirectStatus = 'connected' | 'error';

export interface BuildCallbackRedirectUrlInput {
  appReturnBaseUrl: string; // origen público de Walinka, ej. https://go.ventalink.app
  status: CallbackRedirectStatus;
}

/**
 * URL de retorno a Walinka tras el callback. Solo 2 query params, ambos NO
 * sensibles: tab (abre la pestaña correcta) y mp (connected|error). Nunca
 * incluye code, state, tokens, ni ningún mensaje de error de Mercado Pago
 * -- requisito explícito del ticket (nada sensible en query params). Nótese
 * que esta función NO recibe ningún token/code/state como parámetro: es
 * estructuralmente imposible que termine en la URL devuelta.
 */
export function buildCallbackRedirectUrl({ appReturnBaseUrl, status }: BuildCallbackRedirectUrlInput): string {
  const url = new URL('/business-configuration', appReturnBaseUrl);
  url.searchParams.set('tab', 'mercadopago');
  url.searchParams.set('mp', status);
  return url.toString();
}
