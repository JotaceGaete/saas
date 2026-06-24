/**
 * Post-processes a formatted price string according to the business price display mode.
 *
 * displayMode values:
 *   'auto'               — no change; preserves current per-currency/country behavior
 *   'always'             — no change; zero-decimal currencies (CLP, ARS, COP…) already omit
 *                          decimals by design, so forcing them would misrepresent the format
 *   'hide_zero_decimals' — strips trailing .00 / ,00 only when the amount has no fractional part
 *
 * @param {string} formatted    - already-formatted price string, e.g. "C$160.00", "$ 3.000"
 * @param {number|string} amount - raw numeric amount before formatting
 * @param {string} [displayMode='auto']
 * @returns {string}
 */
export function applyPriceDisplayMode(formatted, amount, displayMode = 'auto') {
  if (displayMode !== 'hide_zero_decimals') return formatted;

  const n = Number(amount);
  // Only strip when the raw value has no fractional part (e.g. 160 but not 160.50)
  if (!Number.isFinite(n) || n % 1 !== 0) return formatted;

  // Matches ".00" or ",00" at end of string (covers both decimal separator conventions)
  return formatted.replace(/[.,]00$/, '');
}
