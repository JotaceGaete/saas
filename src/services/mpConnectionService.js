/**
 * mpConnectionService — MP-OAUTH-1.
 * Cliente para el estado de conexión OAuth de Mercado Pago del negocio del
 * usuario autenticado y para las Edge Functions mp-oauth-start /
 * mp-oauth-disconnect. Completamente aislado del Mercado Pago de billing
 * de plataforma (src/config/paymentProvider.js, /plans) -- no lo importa.
 *
 * Este servicio NUNCA lee ni escribe la tabla de conexiones directamente a
 * través del cliente Supabase (esa tabla no tiene ninguna policy de acceso
 * para el browser -- ver migración) y NUNCA ve un access_token/refresh_token:
 * el estado se lee exclusivamente vía la RPC wa_get_my_mp_connection_status(),
 * que ya filtra qué campos son seguros de devolver.
 */
import { supabase } from '../lib/supabase';
import { getSupabasePublishableKey } from '../lib/supabasePublishableKey';

const SUPABASE_URL = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const ANON_KEY     = getSupabasePublishableKey();
const START_URL      = `${SUPABASE_URL}/functions/v1/mp-oauth-start`;
const DISCONNECT_URL = `${SUPABASE_URL}/functions/v1/mp-oauth-disconnect`;
const TERMINALS_URL  = `${SUPABASE_URL}/functions/v1/mp-point-terminals`;

async function getToken() {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = session?.access_token?.trim();
    if (token?.includes('.')) return token;
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr) throw refreshErr;
    return refreshed?.session?.access_token?.trim() ?? null;
  } catch {
    return null;
  }
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    apikey: ANON_KEY,
    'Content-Type': 'application/json',
  };
}

/**
 * Estado actual de la conexión MP del negocio del usuario autenticado.
 * Vía RPC (SECURITY DEFINER, deriva el negocio de auth.uid() server-side)
 * -- nunca vía SELECT directo a mp_connections.
 * @returns {Promise<{data: {connected: boolean, status: string, providerUserId?: string, connectedAt?: string, liveMode?: boolean}|null, error: Error|null}>}
 */
export async function getMercadoPagoConnectionStatus() {
  const { data, error } = await supabase.rpc('wa_get_my_mp_connection_status');
  if (error) return { data: null, error };
  return { data, error: null };
}

/**
 * Inicia el flujo OAuth: pide a mp-oauth-start una authorizationUrl (state
 * + PKCE generados y persistidos server-side) y navega el browser hacia
 * Mercado Pago. No recibe ni maneja ningún dato sensible -- la función
 * Edge nunca devuelve más que { authorizationUrl }.
 * `error.reason` propaga el `reason` que devuelve la Edge Function (p. ej.
 * `MP_COUNTRY_NOT_SUPPORTED`) para que la UI pueda mostrar un mensaje
 * específico sin tener que interpretar el texto de `error`.
 * @returns {Promise<{error: (Error & {reason?: string})|null}>}
 */
export async function startMercadoPagoOAuth() {
  const token = await getToken();
  if (!token) return { error: new Error('No autenticado') };
  try {
    const res = await fetch(START_URL, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({}) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.authorizationUrl) {
      const err = new Error(body?.error ?? `HTTP ${res.status}`);
      if (body?.reason) err.reason = body.reason;
      return { error: err };
    }
    window.location.assign(body.authorizationUrl);
    return { error: null };
  } catch (err) {
    return { error: err };
  }
}

/**
 * MP-POINT-0 — busca las terminales Point de la cuenta MP conectada al
 * negocio del usuario autenticado. Nunca recibe ni maneja un
 * access_token: mp-point-terminals lo descifra y lo usa server-side, y
 * solo devuelve el subconjunto seguro de cada terminal
 * (id/posId/storeId/externalPosId/operatingMode). Puramente de lectura
 * -- no crea órdenes ni cambia operating_mode.
 * `error.reason` propaga el `reason` de la Edge Function (p. ej.
 * `MP_NOT_CONNECTED`, `MP_CONNECTION_EXPIRED`, `MP_TOKEN_REJECTED`,
 * `MP_FORBIDDEN`) para que la UI pueda mostrar un mensaje específico.
 * @returns {Promise<{data: {terminals: Array, total: number|null}|null, error: (Error & {reason?: string})|null}>}
 */
export async function fetchMercadoPagoPointTerminals() {
  const token = await getToken();
  if (!token) return { data: null, error: new Error('No autenticado') };
  try {
    const res = await fetch(TERMINALS_URL, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({}) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(body?.error ?? `HTTP ${res.status}`);
      if (body?.reason) err.reason = body.reason;
      return { data: null, error: err };
    }
    return { data: { terminals: body?.terminals ?? [], total: body?.total ?? null }, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

/**
 * Desconecta la cuenta de Mercado Pago del negocio del usuario autenticado.
 * @returns {Promise<{data: {connected: boolean}|null, error: Error|null}>}
 */
export async function disconnectMercadoPago() {
  const token = await getToken();
  if (!token) return { data: null, error: new Error('No autenticado') };
  try {
    const res = await fetch(DISCONNECT_URL, { method: 'POST', headers: authHeaders(token), body: JSON.stringify({}) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { data: null, error: new Error(body?.error ?? `HTTP ${res.status}`) };
    return { data: body, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}
