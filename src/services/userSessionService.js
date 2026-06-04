/**
 * User session tracking service.
 * Tracks login, activity, and logout in public.user_sessions (Supabase).
 * All failures are non-fatal — they log a warning and continue.
 */
import { supabase } from '../lib/supabase';

const SESSION_KEY = 'walinka_session_id';
const TOUCH_INTERVAL_MS = 60_000; // 60 seconds
const TOUCH_THROTTLE_MS = 60_000;

let touchTimer = null;
let lastTouchAt = 0;
let currentSessionId = null;

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

export async function startSession(businessId) {
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
    currentSessionId = data;
    setStoredSessionId(data);
    return data;
  } catch (err) {
    console.warn('[session-tracking] startSession exception:', err?.message);
    return null;
  }
}

export async function touchSession(sessionId) {
  const id = sessionId || currentSessionId || getStoredSessionId();
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
  const id = sessionId || currentSessionId || getStoredSessionId();
  if (!id) return;
  stopHeartbeat();
  currentSessionId = null;
  setStoredSessionId(null);
  try {
    const { error } = await supabase.rpc('end_user_session', { p_session_id: id });
    if (error) console.warn('[session-tracking] end_user_session failed:', error.message);
  } catch (err) {
    console.warn('[session-tracking] endSession exception:', err?.message);
  }
}

export function startHeartbeat(sessionId) {
  stopHeartbeat();
  const id = sessionId || currentSessionId || getStoredSessionId();
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
  return currentSessionId || getStoredSessionId();
}

/** Register activity events that trigger a throttled touch. */
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

/** Best-effort end via sendBeacon on page unload. */
export function registerUnloadHandler(sessionId) {
  const handler = () => {
    const id = sessionId || getCurrentSessionId();
    if (!id) return;
    // sendBeacon cannot call supabase RPC directly, so we fire a best-effort fetch
    // We use keepalive fetch instead
    try {
      const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL ?? '';
      const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY ?? '';
      if (!supabaseUrl || !anonKey) return;
      fetch(`${supabaseUrl}/rest/v1/rpc/end_user_session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey,
          Authorization: `Bearer ${anonKey}`,
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
