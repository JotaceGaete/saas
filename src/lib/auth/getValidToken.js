import { supabase } from '../supabase';

function isCorruptRefreshTokenError(errorLike) {
  const raw = String(errorLike?.message || errorLike || '').toLowerCase();
  return raw.includes('refresh token not found')
    || raw.includes('invalid refresh token')
    || raw.includes('refresh_token_not_found');
}

export async function getValidToken() {
  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError && isCorruptRefreshTokenError(sessionError)) {
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    return null;
  }

  const token = typeof session?.access_token === 'string' ? session.access_token.trim() : '';
  if (token && token.includes('.')) return token;

  try {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError && isCorruptRefreshTokenError(refreshError)) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
      return null;
    }

    const refreshedToken = typeof refreshed?.session?.access_token === 'string'
      ? refreshed.session.access_token.trim()
      : '';

    return refreshedToken && refreshedToken.includes('.') ? refreshedToken : null;
  } catch {
    return null;
  }
}
