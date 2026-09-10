/**
 * customerEmail — validación/normalización del email opcional del
 * comprador en el checkout público (EMAIL-PAYMENTS-2).
 *
 * Compatible con el backend (supabase/functions/create-merchant-mp-checkout/lib.ts,
 * parseCustomer): mismo límite de longitud (254) y mismo patrón de email
 * (/^[^\s@]+@[^\s@]+\.[^\s@]+$/). El backend además hace lowercase --
 * eso no se replica acá porque no cambia validez ni longitud.
 */

/** Máximo de caracteres del email (compatible con el backend). */
export const MAX_CUSTOMER_EMAIL_LENGTH = 254;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Normaliza el input del campo: solo trim. Vacío = ausencia de email. */
export function normalizeCustomerEmailInput(raw) {
  return String(raw ?? '').trim();
}

/**
 * Campo opcional: vacío (tras trim) siempre es válido.
 * Con contenido, valida formato/longitud igual que el backend y rechaza
 * explícitamente CR/LF (verificado sobre el valor crudo, antes del trim).
 */
export function isValidCustomerEmail(raw) {
  if (/[\r\n]/.test(String(raw ?? ''))) return false;
  const value = normalizeCustomerEmailInput(raw);
  if (!value) return true;
  if (value.length > MAX_CUSTOMER_EMAIL_LENGTH) return false;
  return EMAIL_RE.test(value);
}
