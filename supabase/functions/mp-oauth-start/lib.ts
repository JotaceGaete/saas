/**
 * mp-oauth-start/lib.ts
 * Funciones puras extraídas de index.ts para poder testearlas en
 * Vitest/Node (mismo criterio que mp-webhook/lib.ts y
 * plan-change-preview/lib.ts). Usa únicamente Web Crypto estándar
 * (`crypto.subtle`, `crypto.getRandomValues`) -- disponible tal cual
 * en Deno y en Node/Vitest, sin imports específicos de runtime.
 *
 * IMPORTANTE: esto NO reemplaza pgp_sym_encrypt/pgp_sym_decrypt
 * (pgcrypto, formato OpenPGP). El cifrado del code_verifier ocurre
 * exclusivamente dentro de Postgres, vía la RPC
 * wa_create_mp_oauth_state() (ver migración). Este archivo solo genera
 * el material en claro (code_verifier, code_challenge, state) y su
 * hash de lookup (state_hash) -- nunca cifra ni descifra nada.
 */

const CODE_VERIFIER_BYTES = 32; // 32 bytes -> 43 chars base64url (RFC 7636: 43-128)
const STATE_BYTES = 32;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

/** PKCE code_verifier: 43 caracteres base64url (dentro del rango 43-128 de RFC 7636). */
export function generateCodeVerifier(): string {
  return toBase64Url(randomBytes(CODE_VERIFIER_BYTES));
}

/** state OAuth: token aleatorio de alta entropía (256 bits), independiente del code_verifier. */
export function generateState(): string {
  return toBase64Url(randomBytes(STATE_BYTES));
}

/** PKCE code_challenge = BASE64URL(SHA256(code_verifier)) -- method S256 (RFC 7636). */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(codeVerifier));
  return toBase64Url(new Uint8Array(digest));
}

/** SHA-256 (hex) del state -- lo único que se persiste en mp_oauth_states.state_hash. */
export async function hashState(state: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(state));
  return toHex(new Uint8Array(digest));
}

export interface BuildAuthorizationUrlInput {
  authBaseUrl: string;
  clientId: string;
  redirectUri: string;
  state: string;
  codeChallenge: string;
}

/**
 * URL de autorización OAuth de Mercado Pago (Authorization Code + PKCE
 * S256). Parámetros documentados oficialmente por MP: response_type,
 * client_id, redirect_uri, code_challenge, code_challenge_method.
 * `state` es estándar OAuth2, recomendado explícitamente por MP y
 * devuelto tal cual en el callback -- no es un parámetro inventado.
 * No se agrega ningún parámetro fuera de estos 6.
 */
export function buildAuthorizationUrl({
  authBaseUrl,
  clientId,
  redirectUri,
  state,
  codeChallenge,
}: BuildAuthorizationUrlInput): string {
  const url = new URL(authBaseUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface BusinessRow {
  id: string;
  user_id: string;
}

export type ResolveBusinessResult<T extends BusinessRow = BusinessRow> =
  | { ok: true; business: T }
  | { ok: false; reason: 'no_business' | 'multiple_businesses' | 'ownership_mismatch' };

/**
 * Resuelve el ÚNICO negocio del usuario autenticado. `businesses` debe
 * venir YA filtrado por `.eq('user_id', authenticatedUserId)` en la
 * consulta real (mismo patrón que create-mp-preference) -- esta
 * función no tiene NINGÚN parámetro para un business_id de cliente, a
 * propósito: estructuralmente no puede "elegir" el negocio de otro
 * usuario, sin importar qué venga en el body de la request.
 *
 * Genérica sobre `T extends BusinessRow` para que un llamador que
 * seleccionó columnas adicionales (p. ej. mp-oauth-start selecciona
 * también `country_code` para enrutar credenciales MP por país) reciba
 * ese mismo shape de vuelta en `business`, sin duplicar esta lógica de
 * aislamiento de tenant. Los llamadores que solo necesitan {id,user_id}
 * (mp-oauth-disconnect) siguen funcionando exactamente igual -- T se
 * infiere como BusinessRow por defecto.
 */
export function resolveBusinessForOAuth<T extends BusinessRow>(
  businesses: T[],
  authenticatedUserId: string,
): ResolveBusinessResult<T> {
  if (businesses.length === 0) return { ok: false, reason: 'no_business' };
  if (businesses.length > 1) return { ok: false, reason: 'multiple_businesses' };
  const business = businesses[0];
  if (business.user_id !== authenticatedUserId) return { ok: false, reason: 'ownership_mismatch' };
  return { ok: true, business };
}
