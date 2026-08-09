/**
 * Captura y persistencia del código de referido (?ref=CODIGO) que llega
 * desde walinka.com a /business-registration. Vive en sessionStorage
 * (nunca localStorage, nunca cookies) porque alcanza con que sobreviva
 * la pestaña actual, incluido el round-trip de Google OAuth (mismo
 * origen go.ventalink.app antes y después del redirect a Google).
 *
 * Separado de utils/analytics.js (collectVisitAttribution) a propósito:
 * ese helper es una lectura pura de atribución de tráfico (utm_*,
 * referrer) para analytics, sin efectos secundarios; esto es un valor
 * de negocio distinto (código de referido) con lógica de persistencia
 * propia (sobrescribir vs conservar).
 */

export const REFERRAL_STORAGE_KEY = 'walinka_referral_code';

function getSessionStorage() {
  return typeof window !== 'undefined' ? window.sessionStorage : null;
}

/**
 * Lee ?ref= de la URL actual.
 *   - Si está presente, lo guarda en sessionStorage (sobrescribe cualquier
 *     valor previo) y lo retorna.
 *   - Si no está presente, conserva lo que ya hubiera guardado y lo retorna
 *     (o null si nunca se guardó nada).
 *
 * @returns {string|null}
 */
export function captureReferralCode() {
  if (typeof window === 'undefined') return null;
  const storage = getSessionStorage();

  let ref = null;
  try {
    ref = new URLSearchParams(window.location.search).get('ref');
  } catch {
    ref = null;
  }

  try {
    if (ref) {
      storage?.setItem(REFERRAL_STORAGE_KEY, ref);
      return ref;
    }
    return storage?.getItem(REFERRAL_STORAGE_KEY) || null;
  } catch {
    return ref || null;
  }
}

/** Lee el código de referido persistido, sin tocar ni depender de la URL actual. */
export function getStoredReferralCode() {
  try {
    return getSessionStorage()?.getItem(REFERRAL_STORAGE_KEY) || null;
  } catch {
    return null;
  }
}
