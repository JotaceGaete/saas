/**
 * Detecta si la app se está ejecutando como PWA instalada
 * (standalone / pantalla completa) o si se abrió con el param source=pwa.
 * Usar solo en cliente (depende de window y location).
 * @returns {boolean}
 */
export function isPWA() {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.navigator.standalone === true) return true;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'pwa') return true;
  } catch (_) {}
  return false;
}
