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
 * URL de callback para OAuth (Google, etc.).
 * Chile → cl.ventalink.app, Argentina → ar.ventalink.app, localhost → mismo puerto, resto → go.ventalink.app
 * @returns {string} URL absoluta para redirectTo en signInWithOAuth
 */
export function getAuthRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return 'https://go.ventalink.app/auth/callback';
  }
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  if (!origin) return 'https://go.ventalink.app/auth/callback';
  return `${origin}/auth/callback`;
}

/**
 * URL de redirección para reset de contraseña (olvidé mi contraseña).
 * Misma lógica que getAuthRedirectUrl pero apunta a /reset-password.
 */
export function getResetPasswordRedirectUrl() {
  if (typeof window === 'undefined' || !window?.location?.origin) {
    return 'https://go.ventalink.app/reset-password';
  }
  const origin = String(window.location.origin || '').replace(/\/$/, '');
  if (!origin) return 'https://go.ventalink.app/reset-password';
  return `${origin}/reset-password`;
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
