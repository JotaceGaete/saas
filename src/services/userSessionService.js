/**
 * User session tracking service.
 * Tracks login, activity, and logout in public.user_sessions (Supabase).
 * All failures are non-fatal — they log a warning and continue.
 */
import { supabase } from '../lib/supabase';
import { getSupabasePublishableKey } from '../lib/supabasePublishableKey';

const SESSION_KEY = 'walinka_user_session_id';
const TOUCH_INTERVAL_MS = 60_000;
const TOUCH_THROTTLE_MS = 60_000;

let touchTimer = null;
let lastTouchAt = 0;
// Module-level guard: prevents concurrent startSession calls across renders
let startingSession = false;

function getStoredSessionId() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || null;
  } catch {
    return null;
  }
}

function setStoredSessionId(id) {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* ignore */ }
}

/**
 * Starts a session or reuses the existing one for this tab.
 * Returns the session id (new or existing).
 */
export async function startSession(businessId) {
  // If there's already a session stored for this tab, reuse it
  const existing = getStoredSessionId();
  if (existing) {
    await touchSession(existing);
    return existing;
  }

  // Prevent concurrent calls from creating multiple sessions
  if (startingSession) return null;
  startingSession = true;

  try {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
    const { data, error } = await supabase.rpc('start_user_session', {
      p_business_id: businessId || null,
      p_user_agent: userAgent,
    });
    if (error) {
      console.warn('[session-tracking] start_user_session failed:', error.message);
      return null;
    }
    setStoredSessionId(data);
    return data;
  } catch (err) {
    console.warn('[session-tracking] startSession exception:', err?.message);
    return null;
  } finally {
    startingSession = false;
  }
}

export async function touchSession(sessionId) {
  const id = sessionId || getStoredSessionId();
  if (!id) return;
  const now = Date.now();
  if (now - lastTouchAt < TOUCH_THROTTLE_MS) return;
  lastTouchAt = now;
  try {
    const { error } = await supabase.rpc('touch_user_session', { p_session_id: id });
    if (error) console.warn('[session-tracking] touch_user_session failed:', error.message);
  } catch (err) {
    console.warn('[session-tracking] touchSession exception:', err?.message);
  }
}

export async function endSession(sessionId) {
  const id = sessionId || getStoredSessionId();
  stopHeartbeat();
  setStoredSessionId(null);
  if (!id) return;
  try {
    const { error } = await supabase.rpc('end_user_session', { p_session_id: id });
    if (error) console.warn('[session-tracking] end_user_session failed:', error.message);
  } catch (err) {
    console.warn('[session-tracking] endSession exception:', err?.message);
  }
}

export function startHeartbeat(sessionId) {
  stopHeartbeat();
  const id = sessionId || getStoredSessionId();
  if (!id) return;
  touchTimer = setInterval(() => touchSession(id), TOUCH_INTERVAL_MS);
}

export function stopHeartbeat() {
  if (touchTimer) {
    clearInterval(touchTimer);
    touchTimer = null;
  }
}

export function getCurrentSessionId() {
  return getStoredSessionId();
}

export function registerActivityListeners(sessionId) {
  const handler = () => touchSession(sessionId);
  const events = ['click', 'keydown'];
  events.forEach((e) => window.addEventListener(e, handler, { passive: true }));

  const visibilityHandler = () => {
    if (document.visibilityState === 'visible') touchSession(sessionId);
  };
  document.addEventListener('visibilitychange', visibilityHandler);
  window.addEventListener('focus', handler);

  return () => {
    events.forEach((e) => window.removeEventListener(e, handler));
    document.removeEventListener('visibilitychange', visibilityHandler);
    window.removeEventListener('focus', handler);
  };
}

// NOTA (migración anon key -> publishable key): esta llamada NUNCA debe
// enviar la client API key (anon/publishable) como `Authorization: Bearer`.
// Las nuevas publishable keys no son JWT, así que si se envían en
// Authorization, el gateway intenta decodificarlas como JWT y rechaza la
// petición con "Invalid JWT" (ver docs oficiales de Supabase). Por eso aquí
// solo se manda `apikey`.
//
// Esto NO repara `end_user_session`: esa función es SECURITY DEFINER,
// depende de auth.uid() y solo tiene GRANT EXECUTE a `authenticated`. Sin un
// JWT real de usuario en Authorization, el rol resuelto es `anon` y la
// llamada no tiene permiso para ejecutarla — igual que ocurría antes de
// este cambio (el error ya quedaba absorbido por el .catch() de abajo).
// Arreglarlo de verdad requeriría cachear el access_token real de forma
// síncrona (p. ej. vía supabase.auth.onAuthStateChange) para poder usarlo
// en beforeunload — eso es un cambio de lógica de sesión/auth, deliberadamente
// fuera de alcance de esta migración.
export function registerUnloadHandler(sessionId) {
  const handler = () => {
    const id = sessionId || getCurrentSessionId();
    if (!id) return;
    try {
      const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL ?? '';
      const clientApiKey = getSupabasePublishableKey();
      if (!supabaseUrl || !clientApiKey) return;
      fetch(`${supabaseUrl}/rest/v1/rpc/end_user_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: clientApiKey,
        },
        body: JSON.stringify({ p_session_id: id }),
        keepalive: true,
      }).catch(() => {});
    } catch { /* ignore */ }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}

// Admin helpers
export async function getAdminUsersWithSessionStats() {
  const { data, error } = await supabase.rpc('admin_get_users_with_session_stats');
  if (error) return { data: null, error };
  return { data, error: null };
}

export async function getAdminUserSessionDetail(userId) {
  const { data, error } = await supabase.rpc('admin_get_user_session_detail', { p_user_id: userId });
  if (error) return { data: null, error };
  return { data, error: null };
}
