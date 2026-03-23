import { createClient } from '@supabase/supabase-js';
import { HttpError } from '../../lib/http/HttpError.js';

function getSupabaseUrl() {
  return String(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
}

function getSupabaseAnonKey() {
  return String(process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
}

function getBearerToken(request) {
  const header = String(request.headers.get('authorization') || '').trim();
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  const token = header.slice(7).trim();
  return token || null;
}

function createAuthClient(token) {
  const url = getSupabaseUrl();
  const anon = getSupabaseAnonKey();
  if (!url || !anon) {
    throw new HttpError(500, '[auth] Missing Supabase URL/ANON key for auth validation');
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

