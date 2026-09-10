/**
 * mpOauthCredentials.ts — selección de credenciales OAuth de Mercado Pago
 * por país (CL/AR), compartida por mp-oauth-start y mp-oauth-callback.
 *
 * El país SIEMPRE se deriva server-side de wa_businesses.country_code
 * -- nunca de un valor recibido del frontend/body/query. Este archivo
 * solo mapea un country_code YA resuelto por el llamador a sus
 * credenciales; no lee wa_businesses ni ninguna tabla.
 *
 * Reglas (sin excepciones, sin fallback entre países):
 *   - 'CL' -> MP_CLIENT_ID_CL / MP_CLIENT_SECRET_CL
 *   - 'AR' -> MP_CLIENT_ID_AR / MP_CLIENT_SECRET_AR
 *   - cualquier otro valor (incluido null/undefined/'', o cualquier otro
 *     código ISO) -> 'unsupported_country'. A propósito NO hace fuzzy
 *     matching contra wa_businesses.country (texto libre) -- a
 *     diferencia de create-mp-preference/plan-change-preview (que sí
 *     aceptan más países para pricing con un fallback distinto, no
 *     aplicable acá: un fallback equivocado en OAuth significaría
 *     conectar la cuenta MP de un país incorrecto).
 *   - si el país es CL o AR pero falta la variable de entorno
 *     correspondiente -> 'country_not_configured'. NUNCA cae a las
 *     credenciales del otro país en este caso.
 *
 * Nunca se loguea clientId/clientSecret en ningún camino (éxito o error)
 * -- ni en este archivo ni en sus llamadores.
 */

export type SupportedMpOauthCountry = 'CL' | 'AR';

export interface MpOauthCredentials {
  countryCode: SupportedMpOauthCountry;
  clientId: string;
  clientSecret: string;
}

export interface MpOauthCredentialsEnvInput {
  clientIdCl: string | undefined;
  clientSecretCl: string | undefined;
  clientIdAr: string | undefined;
  clientSecretAr: string | undefined;
}

export type ResolveMpOauthCredentialsResult =
  | { ok: true; credentials: MpOauthCredentials }
  | { ok: false; reason: 'unsupported_country' }
  | { ok: false; reason: 'country_not_configured'; countryCode: SupportedMpOauthCountry };

const SUPPORTED_COUNTRIES: readonly SupportedMpOauthCountry[] = ['CL', 'AR'];

/**
 * Normaliza un country_code crudo (de wa_businesses.country_code) a 'CL'
 * o 'AR', o `null` si no es uno de los dos únicos países que MP-OAUTH
 * soporta hoy. Trim + uppercase únicamente -- sin alias, sin inferencia
 * desde `country`/`currency`.
 */
export function normalizeMpOauthCountry(rawCountryCode: string | null | undefined): SupportedMpOauthCountry | null {
  const code = String(rawCountryCode ?? '').trim().toUpperCase();
  return (SUPPORTED_COUNTRIES as readonly string[]).includes(code) ? (code as SupportedMpOauthCountry) : null;
}

/**
 * Lógica pura de resolución (sin tocar `Deno.env` -- testeable en
 * Vitest/Node). Recibe el country_code crudo y las 4 variables ya
 * leídas del entorno.
 */
export function resolveMpOauthCredentials(
  rawCountryCode: string | null | undefined,
  env: MpOauthCredentialsEnvInput,
): ResolveMpOauthCredentialsResult {
  const countryCode = normalizeMpOauthCountry(rawCountryCode);
  if (countryCode === null) {
    return { ok: false, reason: 'unsupported_country' };
  }

  const clientId = countryCode === 'CL' ? env.clientIdCl : env.clientIdAr;
  const clientSecret = countryCode === 'CL' ? env.clientSecretCl : env.clientSecretAr;

  if (!clientId || clientId.trim() === '' || !clientSecret || clientSecret.trim() === '') {
    return { ok: false, reason: 'country_not_configured', countryCode };
  }

  return {
    ok: true,
    credentials: { countryCode, clientId: clientId.trim(), clientSecret: clientSecret.trim() },
  };
}

/**
 * Wrapper fino que lee las 4 variables desde `Deno.env` y delega a
 * resolveMpOauthCredentials(). Única función de este archivo que toca
 * `Deno` -- por eso no se testea directamente en Vitest, igual que
 * getSupabaseAdminKey()/getSupabasePublishableKey(). Es intencional que
 * devuelva también clientSecret aunque mp-oauth-start no lo use: un
 * único resolver, una única fuente de verdad de qué variable corresponde
 * a qué país, en vez de duplicar el mapeo país->env var en 2 archivos.
 */
export function getMpOauthCredentials(rawCountryCode: string | null | undefined): ResolveMpOauthCredentialsResult {
  return resolveMpOauthCredentials(rawCountryCode, {
    clientIdCl: Deno.env.get('MP_CLIENT_ID_CL'),
    clientSecretCl: Deno.env.get('MP_CLIENT_SECRET_CL'),
    clientIdAr: Deno.env.get('MP_CLIENT_ID_AR'),
    clientSecretAr: Deno.env.get('MP_CLIENT_SECRET_AR'),
  });
}
