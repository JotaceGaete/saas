/**
 * Origen canónico de la app autenticada (panel, login, registro, billing, admin).
 * NO usar para enlaces del catálogo público — usar CATALOG_ORIGIN.
 */
export const APP_ORIGIN = 'https://go.ventalink.app';

/**
 * Dominio público de catálogos: enlaces compartibles, QR, WhatsApp, og:url, canonical.
 * Fuente de verdad única para URLs de catálogo. Cambiar aquí propaga a toda la app.
 */
export const CATALOG_ORIGIN = 'https://miralatienda.de';

const BASE_URL = import.meta.env?.VITE_APP_URL?.trim() || '';

function isLocalhostHostname(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
}

/** Producción VentALink: cualquier host bajo ventalink.app (incl. go, apex, www) o walinka.com. */
function isVentalinkProductionHostname(hostname) {
  const h = String(hostname || '').trim().toLowerCase();
  if (!h) return false;
  return h === 'walinka.com' || h === 'www.walinka.com' || h.endsWith('.walinka.com') ||
    h === 'ventalink.app' || h === 'www.ventalink.app' || h.endsWith('.ventalink.app');
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
 * Dominio canónico para catálogo público (compartir, WhatsApp, QR, SEO cliente).
 * Siempre CATALOG_ORIGIN — nunca localhost ni APP_ORIGIN.
 * @returns {string}
 */
export function getPublicCatalogBaseUrl() {
  return CATALOG_ORIGIN;
}

/**
 * Segmento interno de ruta para React Router y navegación SPA.
 * NO usar para URLs públicas compartibles — usar getPublicCatalogUrl.
 */
export const PUBLIC_CATALOG_SHARE_SEGMENT = 'catalogo';

/**
 * Ruta relativa interna del catálogo (para navigate() de React Router).
 * NO es una URL pública compartible.
 * @param {string} slug
 * @returns {string} p. ej. `/catalogo/mi-tienda` o ''
 */
export function getPublicCatalogRelativePath(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `/${PUBLIC_CATALOG_SHARE_SEGMENT}/${s}`;
}

/**
 * Enlace compartible estándar del catálogo público.
 * Formato oficial: `https://miralatienda.de/catalogo/:slug`
 * getWhatsAppOrderCatalogUrl, QR y copiar-link delegan aquí.
 * @param {string} slug
 * @returns {string}
 */
export function getPublicCatalogUrl(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `${CATALOG_ORIGIN}/catalogo/${s}`;
}

/**
 * Enlace compartible de la vista de ofertas del catálogo.
 * @param {string} slug
 * @returns {string}
 */
export function getPublicOffersUrl(slug) {
  const s = String(slug || '').trim();
  if (!s) return '';
  return `${CATALOG_ORIGIN}/catalogo/${s}/ofertas`;
}

/**
 * Enlace del catálogo para WhatsApp: URL totalmente canónica, sin query params
 * (el crawler de WhatsApp debe ver siempre la misma URL para OG / portada).
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
