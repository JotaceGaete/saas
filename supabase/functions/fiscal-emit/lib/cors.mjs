// CORS de fiscal-emit: lista cerrada de orígenes de Walinka. Sin comodines ni patrones.
//
// - Solo orígenes exactos (esquema + host). Un origen fuera de la lista recibe 403 sin cabeceras
//   Access-Control-*, antes de autenticar y sin tocar la base.
// - Una solicitud sin cabecera Origin (curl, servidor) no es de navegador: pasa al manejador, que
//   exige igualmente el JWT del usuario. CORS no reemplaza la autenticación.
// - Las URL por despliegue de Vercel (saas-<hash>-…) cambian en cada commit y NO se admiten: la
//   Preview autorizada se usa por su alias de rama.
// - Añadir un origen es un cambio de código revisado y un nuevo despliegue, nunca configuración.

export const ALLOWED_ORIGINS = Object.freeze([
  // Producción (alias del despliegue de producción en Vercel).
  'https://go.walinka.com',
  'https://go.ventalink.app',
  // Preview de PR #123 (claude/fiscal-multiempresa-integridad), alias de rama.
  'https://saas-git-claude-fiscal-multiemp-e530d6-juan-s-projects-afd7e18e.vercel.app',
  // Preview de PR #119 (claude/project-thread-x9ut7z), alias de rama.
  'https://saas-git-claude-project-thread-x9ut7z-juan-s-projects-afd7e18e.vercel.app',
]);

const ORIGIN_SET = new Set(ALLOWED_ORIGINS);

// Cabeceras que envía supabase-js (lista canónica de @supabase/supabase-js/cors, v2.118) más
// x-region, que functions.invoke añade si se fija una región.
export const ALLOWED_HEADERS =
  'authorization, x-client-info, apikey, content-type, x-retry-count, traceparent, tracestate, baggage, x-region';
export const ALLOWED_METHODS = 'POST, OPTIONS';
const MAX_AGE_SECONDS = '600';

// Devuelve 'none' (sin Origin), 'allowed' o 'rejected'.
export function classifyOrigin(origin) {
  if (origin == null || origin === '') return 'none';
  return ORIGIN_SET.has(origin) ? 'allowed' : 'rejected';
}

// Cabeceras CORS para una respuesta. Siempre incluye Vary: Origin (la respuesta depende del origen).
export function corsHeadersFor(origin) {
  const h = { vary: 'Origin' };
  if (classifyOrigin(origin) === 'allowed') {
    h['access-control-allow-origin'] = origin;
    h['access-control-allow-methods'] = ALLOWED_METHODS;
    h['access-control-allow-headers'] = ALLOWED_HEADERS;
    h['access-control-max-age'] = MAX_AGE_SECONDS;
  }
  return h;
}
