/**
 * Recorta texto a maxLen sin partir palabras cuando es razonable (p. ej. descripción de negocio 280 caracteres).
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
export function truncateAtWordBoundary(text, maxLen) {
  const s = (text || '').trim();
  if (!s.length || maxLen <= 0) return '';
  if (s.length <= maxLen) return s;
  const cut = s.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.65) return cut.slice(0, lastSpace).trimEnd();
  return cut.trimEnd();
}
