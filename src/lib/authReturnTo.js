/**
 * Ruta interna a la que volver tras el login (Google OAuth), guardada antes
 * de saltar a Google porque el estado de React Router no sobrevive al
 * redirect de página completa. NUNCA usar localStorage: solo necesita durar
 * la vuelta del propio navegador, no compartirse entre pestañas ni dominios.
 */
const RETURN_TO_KEY = 'auth_return_to';

/** Rutas de auth que no tiene sentido usar como destino de retorno (evita loops). */
const AUTH_LOOP_PATHS = ['/login', '/auth/callback', '/auth/reset-password'];

function normalizePath(path) {
  return String(path || '').trim();
}

/**
 * Solo rutas internas: deben empezar con "/" y no ser protocolo-relativas
 * ("//host") ni contener un esquema ("http://", "javascript:", etc.).
 */
export function isSafeReturnPath(path) {
  const p = normalizePath(path);
  if (!p) return false;
  if (!p.startsWith('/')) return false;
  if (p.startsWith('//')) return false;
  if (p.startsWith('/\\')) return false;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  if (AUTH_LOOP_PATHS.some((loop) => p === loop || p.startsWith(`${loop}/`) || p.startsWith(`${loop}?`))) return false;
  return true;
}

export function saveReturnTo(path) {
  if (typeof window === 'undefined') return;
  const p = normalizePath(path);
  try {
    if (isSafeReturnPath(p)) {
      window.sessionStorage.setItem(RETURN_TO_KEY, p);
    } else {
      window.sessionStorage.removeItem(RETURN_TO_KEY);
    }
  } catch {
    /* sessionStorage no disponible (modo privado, etc.): sin retorno guardado */
  }
}

/** Lee y borra la ruta guardada; valida de nuevo antes de devolverla (defensa en profundidad). */
export function consumeReturnTo(fallback = null) {
  if (typeof window === 'undefined') return fallback;
  let stored = null;
  try {
    stored = window.sessionStorage.getItem(RETURN_TO_KEY);
    window.sessionStorage.removeItem(RETURN_TO_KEY);
  } catch {
    return fallback;
  }
  return isSafeReturnPath(stored) ? stored : fallback;
}
