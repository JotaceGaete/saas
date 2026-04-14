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

/**
 * Normaliza un teléfono libre (puede incluir "+" del usuario).
 * Limpia caracteres inválidos, asegura a lo sumo un "+" al inicio.
 * Útil para inputs donde el usuario puede tipear el prefijo completo.
 */
export function normalizeCustomerPhone(input = '') {
  let value = String(input).trim();
  if (!value) return '';
  value = value.replace(/[^\d+]/g, '');
  if (value.startsWith('++')) value = `+${value.slice(2)}`;
  const plusCount = (value.match(/\+/g) || []).length;
  if (plusCount > 1) {
    value = value.replace(/\+/g, '');
    value = `+${value}`;
  }
  if (value.includes('+') && !value.startsWith('+')) {
    value = value.replace(/\+/g, '');
  }
  return value;
}

/**
 * Validación liviana e internacional: 8–15 dígitos, "+" opcional al inicio.
 * No valida por país ni impone formato local.
 */
export function isValidCustomerPhone(input = '') {
  const value = normalizeCustomerPhone(input);
  if (!value) return true; // campo opcional
  return /^\+?\d{8,15}$/.test(value);
}
