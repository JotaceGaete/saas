import { createClient } from '@supabase/supabase-js';
import { getSupabasePublishableKey } from './supabasePublishableKey';

const supabaseUrl = (import.meta.env?.VITE_SUPABASE_URL ?? '').replace(/\/$/, '');
const supabaseAnonKey = getSupabasePublishableKey();

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env file for VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or the legacy VITE_SUPABASE_ANON_KEY)');
}

// Single client only. Storage key is derived from URL — production must use the same VITE_SUPABASE_URL as the project where users log in.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // necesario para OAuth callback (Google, etc.)
  },
});
