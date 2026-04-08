import { supabase } from '../supabase';

/**
 * Returns a valid JWT access token, refreshing the session if the stored token
 * is missing or expired. Critical for mobile OAuth flows where the app may have
 * been backgrounded and the access_token silently expired.
 *
 * @returns {Promise<string|null>} JWT string or null if unauthenticated
 */
export async function getValidToken() {
  const { data: { session } } = await supabase.auth.getSession();
  const token = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
  if (token && token.includes('.')) return token;

  // Token missing or malformed — attempt a silent refresh before giving up
  try {
    const { data: refreshed } = await supabase.auth.refreshSession();
    const refreshedToken = typeof refreshed?.session?.access_token === 'string'
      ? refreshed.session.access_token.trim()
      : '';
    return refreshedToken && refreshedToken.includes('.') ? refreshedToken : null;
  } catch {
    return null;
  }
}
