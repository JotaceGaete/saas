/**
 * URL base pública de la app (frontend).
 * En producción: https://cl.ventalink.app o https://ar.ventalink.app según país.
 * Configurar en Vercel: VITE_APP_URL con el dominio del deploy (o dejar vacío para usar window.location.origin).
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
