// Client API key para el frontend: nueva Supabase publishable key
// (sb_publishable_...) con fallback temporal a la legacy anon key mientras
// se completa la migración. Centraliza la precedencia para que ningún
// consumidor lea VITE_SUPABASE_ANON_KEY directamente.
//
// Ambas formas se usan siempre como valor opaco (apikey / 2º argumento de
// createClient()), nunca decodificado — ver auditoría de migración frontend.

export function resolveSupabasePublishableKey({ publishableKey, legacyAnonKey }) {
  const pk = String(publishableKey ?? '').trim();
  if (pk) return pk;
  const legacy = String(legacyAnonKey ?? '').trim();
  if (legacy) return legacy;
  return '';
}

export function getSupabasePublishableKey() {
  return resolveSupabasePublishableKey({
    publishableKey: import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY,
    legacyAnonKey: import.meta.env?.VITE_SUPABASE_ANON_KEY,
  });
}
