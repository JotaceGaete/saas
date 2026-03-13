/**
 * URL base pública de la app (frontend).
 * Prioridad: VITE_APP_URL (build) → window.location.origin (runtime).
 * En producción: https://cl.ventalink.app o https://ar.ventalink.app según deploy.
 */
const BASE_URL = import.meta.env?.VITE_APP_URL?.trim() || '';

/**
 * @returns {string} URL base pública (sin trailing slash), o '' si no hay origen.
 */
export function getAppBaseUrl() {
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window?.location?.origin) return window.location.origin;
  return '';
}

/**
 * URL pública compartible del catálogo de un negocio.
 * Usa getAppBaseUrl() (env → window.location.origin) y ruta /catalogo/:slug.
 * @param {string} slug - Slug del negocio
 * @returns {string} URL absoluta o '' si no hay base
 */
export function getPublicCatalogUrl(slug) {
  if (!slug) return '';
  const base = getAppBaseUrl();
  const origin = base || (typeof window !== 'undefined' && window?.location?.origin) || '';
  const clean = origin.replace(/\/$/, '');
  return clean ? `${clean}/catalogo/${slug}` : '';
}

export default getAppBaseUrl;
