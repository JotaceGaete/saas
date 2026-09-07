import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http/HttpError.js';

function getSupabaseUrl() {
  return String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
}

// Client API key para el userClient de validación de JWT (nunca usada como
// Authorization — eso siempre es el bearer real del caller, ver
// createAuthClient). Nueva publishable key con fallback temporal a las
// legacy anon keys mientras se completa la migración backend.
export function resolveSupabasePublishableKey({ publishableViteKey, publishableKey, legacyAnonViteKey, legacyAnonKey }) {
  const candidates = [publishableViteKey, publishableKey, legacyAnonViteKey, legacyAnonKey];
  for (const candidate of candidates) {
    const trimmed = String(candidate ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

function getSupabasePublishableKey() {
  return resolveSupabasePublishableKey({
    publishableViteKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
    legacyAnonViteKey: process.env.VITE_SUPABASE_ANON_KEY,
    legacyAnonKey: process.env.SUPABASE_ANON_KEY,
  });
}

function getBearerToken(request) {
  const header = String(request.headers.get('authorization') || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function createAuthClient(token) {
  const url = getSupabaseUrl();
  const anon = getSupabasePublishableKey();
  if (!url || !anon) {
    throw new HttpError(500, '[auth] Missing Supabase URL/publishable key for auth validation');
  }

  return createClient(url, anon, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });
}

export async function requireAuthenticatedUser(request) {
  const token = getBearerToken(request);
  if (!token) {
    throw new HttpError(401, '[auth] Missing Bearer token');
  }

  const authClient = createAuthClient(token);
  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user?.id) {
    throw new HttpError(401, '[auth] Invalid or expired user token');
  }

  return data.user;
}

