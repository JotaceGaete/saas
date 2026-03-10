/**
 * URL base pública de la app (frontend).
 * En producción: https://app.gong.cl
 * Configurar en Vercel: VITE_APP_URL=https://app.gong.cl
 * En desarrollo sin variable: usa window.location.origin.
 */
const BASE_URL = import.meta.env?.VITE_APP_URL?.trim() || '';

/**
 * @returns {string} URL base pública (con trailing slash eliminado)
 */
export function getAppBaseUrl() {
  if (BASE_URL) return BASE_URL.replace(/\/$/, '');
  if (typeof window !== 'undefined' && window?.location?.origin) return window.location.origin;
  return '';
}

export default getAppBaseUrl;
