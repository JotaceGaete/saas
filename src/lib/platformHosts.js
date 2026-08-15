/**
 * Clasificación de hostname: ¿es un dominio propio de la plataforma
 * (go.ventalink.app, go.walinka.com, etc.) o un dominio personalizado de
 * catálogo de un negocio? Extraído de Routes.jsx a este módulo puro, sin
 * dependencias, para que sea testeable sin importar el árbol completo de
 * rutas (~40 páginas) -- Routes.jsx sigue usando exactamente esta misma
 * lógica, sin cambio de comportamiento.
 */
export const PLATFORM_HOSTS = [
  'ventalink.app',
  'go.ventalink.app',
  'cl.ventalink.app',
  'miralatienda.de',
  'www.miralatienda.de',
  'go.walinka.com',
];

export function isCustomDomain(hostname) {
  if (!hostname || hostname === 'localhost') return false;
  if (/^(127\.|192\.168\.|10\.|::1)/.test(hostname)) return false;
  if (/\.vercel\.app$/i.test(hostname)) return false;
  return !PLATFORM_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`));
}
