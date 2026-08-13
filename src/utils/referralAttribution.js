/**
 * Captura y resolución del código de referido (?ref=) hacia el Affiliate
 * Core de walinkaref (wa_attribute_referral). localStorage a propósito:
 * el tramo relevante (business-registration -> Google/confirmación de
 * email -> auth-callback) puede aterrizar en una pestaña/ventana distinta
 * de la que capturó el ?ref= -- el enlace de confirmación de email abre un
 * contexto nuevo, y sessionStorage (aislado por pestaña) perdía el pending
 * justo en ese salto. localStorage sigue siendo same-origin (nunca cruza
 * dominio) y complementa, sin duplicar, la ventana de 30 días que ya
 * aplica wa_attribute_referral() server-side sobre click_at.
 */
import { attributeReferral } from '../services/referralService';

const STORAGE_KEY = 'vtlk_pending_referral';

/**
 * DIAGNÓSTICO TEMPORAL -- instrumentación observacional para reproducir a
 * mano un registro con enlace de afiliado y ver en qué paso exacto se
 * pierde o completa la atribución. No decide nada, solo loguea. Sin PII:
 * nunca userId, email, JWT, tokens ni claves de Supabase. El código de
 * referido nunca se imprime completo -- solo `hasReferralCode`. Candidato
 * a remover una vez completado el diagnóstico.
 */
function logAttribution(event, data) {
  console.log(`[referralAttribution] ${event}`, data);
}

/**
 * Tolerancia para distinguir, en el flujo de Google OAuth, "esta cuenta se
 * acaba de crear" de "esta cuenta ya existía" -- comparando
 * user.created_at vs user.last_sign_in_at, ambos timestamps emitidos por
 * el propio servidor de Supabase Auth (nunca el reloj del cliente ni la
 * duración del redirect a Google). En un signup nuevo real, ambos se
 * escriben dentro del procesamiento síncrono de la misma request; en un
 * login real de una cuenta existente, la diferencia es de minutos/horas
 * como piso. 2000ms da margen al procesamiento interno de Supabase sin
 * acercarse a ese piso.
 */
const NEW_ACCOUNT_TOLERANCE_MS = 2000;

/**
 * Razones de wa_attribute_referral() que son definitivas: reintentar con
 * exactamente los mismos datos (code, clickAt) daría siempre el mismo
 * resultado, así que no tiene sentido seguir guardando el referral.
 */
const DETERMINISTIC_REJECT_REASONS = new Set([
  'already_attributed',
  'self_referral',
  'invalid_code',
  'click_in_future',
  'click_window_expired',
  'empty_code',
]);

/**
 * Lee ?ref= de la URL actual y lo persiste con un clickAt fresco. Si no
 * hay ?ref= en la URL, no toca lo que ya estuviera guardado (cubre tanto
 * un remount sin ref como la vuelta de Google a /auth/callback, que nunca
 * trae ?ref=). Si hay ?ref=, siempre (re)escribe -- cada llegada real por
 * el enlace es un click legítimo, incluso si el código es el mismo.
 */
export function captureReferralFromUrl() {
  if (typeof window === 'undefined') return;
  const code = new URLSearchParams(window.location.search).get('ref');
  const trimmed = (code || '').trim();
  const hasReferralCode = Boolean(trimmed);
  if (!hasReferralCode) {
    logAttribution('capture_no_ref_param', { hasReferralCode: false });
    return;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ code: trimmed, clickAt: new Date().toISOString() }));
    logAttribution('capture_stored', { hasReferralCode: true, stored: true });
  } catch (err) {
    logAttribution('capture_store_failed', { hasReferralCode: true, stored: false, errorMessage: err?.message });
    // localStorage inaccesible (modo privado estricto, cuota, etc.) -- no bloquea nada más.
  }
}

/** @returns {{code: string, clickAt: string} | null} */
export function getStoredReferral() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.code || !parsed?.clickAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearStoredReferral() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}

/**
 * true solo si created_at y last_sign_in_at (de Supabase Auth) están a
 * <= 2000ms de distancia -- ver NEW_ACCOUNT_TOLERANCE_MS. Uso exclusivo
 * del flujo Google OAuth (email/password ya sabe si fue signUp o signIn
 * sin necesitar ninguna heurística de timestamps).
 */
export function isNewAccountFromTimestamps(user) {
  const createdAt = user?.created_at ? new Date(user.created_at).getTime() : NaN;
  const lastSignInAt = user?.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : NaN;
  if (Number.isNaN(createdAt) || Number.isNaN(lastSignInAt)) return false;

  return Math.abs(lastSignInAt - createdAt) <= NEW_ACCOUNT_TOLERANCE_MS;
}

/**
 * Único punto que llama wa_attribute_referral(). Best-effort: nunca lanza
 * hacia el caller -- un fallo acá jamás debe romper signup/onboarding.
 *
 * Decide si limpiar el pending guardado según la respuesta real de la RPC:
 *   - isEligible=false (usuario existente)     -> limpia, NUNCA llama la RPC
 *   - attributed:true                          -> limpia (ya quedó fila permanente)
 *   - attributed:false con razón determinista  -> limpia (reintentar daría lo mismo)
 *   - la llamada lanza (red/Supabase caído)    -> NO limpia (reintento futuro)
 *
 * @param {{ userId: string|null|undefined, isEligible: boolean, authPath?: string }} params
 *   `authPath` es solo diagnóstico (identifica qué flujo llamó: registro con
 *   sesión inmediata, login, callback de Google, callback de confirmación
 *   de email) -- no participa en ninguna decisión.
 */
export async function attemptPendingAttribution({ userId, isEligible, authPath }) {
  if (!userId) {
    logAttribution('attribution_skipped', { authPath, reason: 'not_authenticated' });
    return { attempted: false, reason: 'not_authenticated' };
  }

  const pending = getStoredReferral();
  const hasPending = Boolean(pending);
  logAttribution('attribution_start', { authPath, isEligible, hasPending });

  if (!pending) {
    return { attempted: false, reason: 'no_pending_referral' };
  }

  if (!isEligible) {
    clearStoredReferral();
    logAttribution('attribution_skipped', { authPath, reason: 'not_eligible_existing_user', pendingCleared: true });
    return { attempted: false, reason: 'not_eligible_existing_user' };
  }

  try {
    logAttribution('attribution_rpc_call', { authPath, hasReferralCode: true });
    const result = await attributeReferral(pending.code, pending.clickAt);
    const pendingCleared = result?.attributed === true || DETERMINISTIC_REJECT_REASONS.has(result?.reason);
    if (pendingCleared) {
      clearStoredReferral();
    }
    logAttribution('attribution_result', {
      authPath,
      attributed: result?.attributed ?? null,
      reason: result?.reason ?? null,
      pendingCleared,
    });
    return { attempted: true, result };
  } catch (err) {
    logAttribution('attribution_rpc_error', {
      authPath,
      errorMessage: err?.message,
      errorCode: err?.code,
      pendingCleared: false,
    });
    console.warn(
      '[referralAttribution] attributeReferral falló (posible error transitorio), se conserva el referral guardado para reintentar:',
      err?.message
    );
    return { attempted: true, error: err };
  }
}
