/**
 * URL base pública de la app (frontend).
 * Prioridad: VITE_APP_URL (build) → window.location.origin (runtime).
 * En producción: https://go.ventalink.app
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
 * URL de callback para OAuth (Google, etc.).
 * @returns {string} URL absoluta para redirectTo en signInWithOAuth
 */
export function getAuthRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return `${GO_APP_ORIGIN}/auth/callback`;
  }
  const hostname = String(window.location.hostname || '').trim().toLowerCase();
  // En local dev permitimos callback local para no romper pruebas OAuth locales.
  if (isLocalhostHostname(hostname)) {
    const origin = String(window.location.origin || '').replace(/\/$/, '');
    if (origin) return `${origin}/auth/callback`;
  }
  // Producción/cualquier host no local: siempre volver al host canónico de la app.
  return `${GO_APP_ORIGIN}/auth/callback`;
}

/**
 * URL de redirección para reset de contraseña (olvidé mi contraseña).
 * Debe coincidir con una entrada en Supabase → Authentication → URL Configuration → Redirect URLs.
 * Ruta dedicada: evita que / redirija al dashboard y pierda el hash con los tokens.
 */
export function getResetPasswordRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return 'https://go.ventalink.app/auth/reset-password';
  }
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  if (!origin) return 'https://go.ventalink.app/auth/reset-password';
  return `${origin}/auth/reset-password`;
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

/**
 * `/catalogo/` por defecto; `/catalog/` si la vista actual usa esa ruta (en inglés).
 */
export function getPublicCatalogPathSegment() {
  if (typeof window === 'undefined') return 'catalogo';
  const path = window.location?.pathname || '';
  return path.startsWith('/catalog/') ? 'catalog' : 'catalogo';
}

/**
 * URL absoluta del catálogo alineada con la ruta actual (catalogo vs catalog).
 */
export function getPublicCatalogUrlWithLocalePath(slug) {
  if (!slug) return '';
  const base = getAppBaseUrl();
  const origin = base || (typeof window !== 'undefined' && window?.location?.origin) || '';
  const clean = String(origin).replace(/\/$/, '');
  if (!clean) return '';
  const seg = getPublicCatalogPathSegment();
  return `${clean}/${seg}/${slug}`;
}

/**
 * Evita que WhatsApp reutilice la miniatura/link preview en caché entre envíos.
 * @param {string} url
 */
export function appendOgPreviewCacheBust(url) {
  if (!url || typeof url !== 'string') return '';
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}p=${Date.now()}`;
}

/**
 * Link del catálogo para mensajes de pedido por WhatsApp (URL única por envío).
 */
export function getWhatsAppOrderCatalogUrl(slug) {
  return appendOgPreviewCacheBust(getPublicCatalogUrlWithLocalePath(slug));
}

export default getAppBaseUrl;
