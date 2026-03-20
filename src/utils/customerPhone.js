/** Máximo de dígitos tras el prefijo "+" (recomendación E.164). */
export const MAX_CUSTOMER_PHONE_DIGITS = 15;

/**
 * Solo dígitos, recortado a largo máximo (para estado del input tras "+").
 */
export function extractPhoneDigitsOnly(raw) {
  return String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, MAX_CUSTOMER_PHONE_DIGITS);
}

/**
 * Formato suave con espacios mientras escribe (agrupa de a 3 desde la derecha).
 * Aplicable a cualquier país (E.164); no infiere país ni bloquea al usuario.
 */
export function formatPhoneDigitsForDisplay(digits) {
  const d = String(digits ?? '').replace(/\D/g, '');
  if (!d) return '';
  return d.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Teléfono opcional en checkout: null si vacío o si hay menos de 6 dígitos (sin mostrar error).
 * Devuelve "+<dígitos>" compacto (internacional) para `customer_phone` y mensajes.
 */
export function normalizeOptionalCustomerPhone(raw) {
  const d = String(raw ?? '')
    .replace(/\D/g, '')
    .slice(0, MAX_CUSTOMER_PHONE_DIGITS);
  if (d.length === 0) return null;
  if (d.length < 6) return null;
  return `+${d}`;
}
