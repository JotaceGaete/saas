/**
 * Shared offer discount calculation.
 * Used by both the public /ofertas page (badge + strikethrough)
 * and the product editor (contextual message + preview).
 *
 * @param {number|string|null} price          - current sale price
 * @param {number|string|null} compareAtPrice - original price (before discount)
 * @returns {number|null} integer percentage (e.g. 33) or null when no valid discount
 */
export function getDiscountPercent(price, compareAtPrice) {
  const p = parseFloat(price);
  const c = parseFloat(compareAtPrice);
  if (isNaN(p) || isNaN(c) || c <= p) return null;
  return Math.round(((c - p) / c) * 100);
}
