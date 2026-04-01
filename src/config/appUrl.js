/**
 * Origen canónico de la app (panel, login, registro, billing, admin) en producción.
 * Landing/catálogo/legal en apex/www; no usar este origen para enlaces solo de marketing.
 */
export const APP_ORIGIN = 'https://go.ventalink.app';

const BASE_URL = import.meta.env?.VITE_APP_URL?.trim() || '';

function isLocalhostHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/** Producción VentALink: cualquier host bajo ventalink.app (incl. go, apex, www). */
function isVentalinkProductionHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return h === 'ventalink.app' || h === 'www.ventalink.app' || h.endsWith('.ventalink.app');
}

/**
 * Host canónico para la app autenticada: siempre APP_ORIGIN en prod VentALink,
 * salvo localhost y previews (Vercel).
 * @returns {string} URL base (sin trailing slash)
 */
export function getAppBaseUrl() {
  if (typeof window !== 'undefined') {
    const host = (window.location.hostname || '').toLowerCase();
    if (isLocalhostHostname(host)) {
      return String(window.location.origin || '').replace(/\/$/, '');
    }
    if (host.endsWith('.vercel.app')) {
      return String(window.location.origin || '').replace(/\/$/, '');
    }
  }
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && isVentalinkProductionHostname(window.location.hostname)) {
    return APP_ORIGIN;
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    return String(window.location.origin).replace(/\/$/, '');
  }
  return APP_ORIGIN;
}

/**
 * @returns {boolean} true si el hostname es el subdominio de app (go.ventalink.app).
 */
export function isCanonicalAppHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'go.ventalink.app';
}

/**
 * Host canónico para catálogo público (compartir, WhatsApp, QR, SEO cliente).
 * Siempre APP_ORIGIN — nunca localhost, cl/ar ni VITE_APP_URL.
 * @returns {string}
 */
export function getPublicCatalogBaseUrl() {
  return APP_ORIGIN;
}

const PUBLIC_CATALOG_ROUTES = new Set(['catalogo', 'catalog']);

/**
 * Segmento canónico para enlaces compartibles (WhatsApp, QR, OG, sitemap).
 * URL pública: `${APP_ORIGIN}/catalogo/:slug` (sin query params).
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
 * Enlace compartible estándar: `${APP_ORIGIN}/catalogo/:slug`.
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
 * URL de callback para OAuth (Google, etc.) y confirmación de email.
 * En producción VentALink siempre APP_ORIGIN (nunca apex/www).
 */
export function getAuthRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${APP_ORIGIN}/auth/callback`;
  }
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (isLocalhostHostname(hostname)) {
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    if (origin) return `${origin}/auth/callback`;
  }
  return `${APP_ORIGIN}/auth/callback`;
}

/**
 * URL de redirección para reset de contraseña (misma política que auth/callback).
 */
export function getResetPasswordRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${APP_ORIGIN}/auth/reset-password`;
  }
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  if (isLocalhostHostname(hostname)) {
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    if (origin) return `${origin}/auth/reset-password`;
  }
  return `${APP_ORIGIN}/auth/reset-password`;
}

export default getAppBaseUrl;
