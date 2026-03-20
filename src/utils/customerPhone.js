/**
 * Teléfono opcional en checkout: sin error si viene vacío.
 * Si hay texto, conserva dígitos y + ( ) - espacio y punto; quita el resto.
 * Si tras limpiar no queda nada y no había ningún dígito en el original → null (no guardar basura).
 */
export function normalizeOptionalCustomerPhone(raw) {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const cleaned = t
    .replace(/[^\d+()\-\s.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned.length > 0) return cleaned;
  return /\d/.test(t) ? t : null;
}
