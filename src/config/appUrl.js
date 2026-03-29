/**
 * URL base pública de la app (panel, rutas internas).
 * Prioridad: VITE_APP_URL (build) → window.location.origin (runtime).
 * No usar para enlaces del catálogo público compartibles: usar getPublicCatalogBaseUrl / buildPublicCatalogUrl.
 */
const BASE_URL = import.meta.env?.VITE_APP_URL?.trim() || '';
const GO_APP_ORIGIN = 'https://go.ventalink.app';

function isLocalhostHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/**
 * @returns {string} URL base pública (sin trailing slash), o '' si no hay origen.
 */
export function getAppBaseUrl() {
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window?.location?.origin) return window.location.origin;
  return '';
}

/**
 * Host canónico para catálogo público (compartir, WhatsApp, QR, SEO cliente).
 * Siempre https://go.ventalink.app — nunca localhost, cl/ar ni VITE_APP_URL.
 * @returns {string}
 */
export function getPublicCatalogBaseUrl() {
  return GO_APP_ORIGIN;
}

const PUBLIC_CATALOG_ROUTES = new Set(['catalogo', 'catalog']);

/**
 * Segmento canónico para enlaces compartibles (WhatsApp, QR, OG, sitemap).
 * URL pública: `https://go.ventalink.app/catalogo/:slug` (sin query params).
 */
export const PUBLIC_CATALOG_SHARE_SEGMENT = 'catalogo';

/**
 * Ruta relativa canónica del catálogo público (mismo segmento que enlaces compartibles).
 * @param {string} slug
 * @returns {string} p. ej. `/catalogo/mi-tienda` o ''
 */
export function getPublicCatalogRelativePath(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `/${PUBLIC_CATALOG_SHARE_SEGMENT}/${s}`;
}

/**
 * URL absoluta del catálogo público en el host canónico.
 * @param {string} slug
 * @param {'catalogo'|'catalog'} [route] - Por defecto {@link PUBLIC_CATALOG_SHARE_SEGMENT} (compartir/pedidos).
 * @returns {string}
 */
export function buildPublicCatalogUrl(slug, route = PUBLIC_CATALOG_SHARE_SEGMENT) {
  const s = String(slug || '').trim();
  if (!s) return '';
  const seg = PUBLIC_CATALOG_ROUTES.has(route) ? route : PUBLIC_CATALOG_SHARE_SEGMENT;
  return `${getPublicCatalogBaseUrl()}/${seg}/${s}`;
}

/**
 * Enlace compartible estándar: `https://go.ventalink.app/catalogo/:slug`.
 * @param {string} slug
 * @returns {string}
 */
export function getPublicCatalogUrl(slug) {
  return buildPublicCatalogUrl(slug, PUBLIC_CATALOG_SHARE_SEGMENT);
}

/**
 * Enlace del catálogo para WhatsApp: URL totalmente canónica, sin query params
 * (el crawler de WhatsApp debe ver siempre la misma URL para OG / portada).
 *
 * @param {string} slug
 */
export function getWhatsAppOrderCatalogUrl(slug) {
  return getPublicCatalogUrl(slug);
}

/**
 * URL de callback para OAuth (Google, etc.).
 * @returns {string} URL absoluta para redirectTo en signInWithOAuth
 */
export function getAuthRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${GO_APP_ORIGIN}/auth/callback`;
  }
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (isLocalhostHostname(hostname)) {
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    if (origin) return `${origin}/auth/callback`;
  }
  return `${GO_APP_ORIGIN}/auth/callback`;
}

/**
 * URL de redirección para reset de contraseña (olvidé mi contraseña).
 */
export function getResetPasswordRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${GO_APP_ORIGIN}/auth/reset-password`;
  }
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  if (!origin) return `${GO_APP_ORIGIN}/auth/reset-password`;
  return `${origin}/auth/reset-password`;
}

export default getAppBaseUrl;
