/**
 * formatMoney — formato monetario para módulos CRM.
 *
 * Símbolo, locale y decimales se resuelven desde COUNTRY_CONFIG,
 * igual que formatPrice — una única fuente de verdad para ambos.
 */
import { COUNTRY_CONFIG } from '../config/countryConfig';

// Build currency metadata from COUNTRY_CONFIG once at module load.
// When multiple countries share a currency, the first entry sets the symbol/locale/decimals.
// USD is overridden to always use en-US for number formatting.
const _meta = Object.create(null);
for (const cfg of Object.values(COUNTRY_CONFIG)) {
  if (!cfg.currency || cfg.currency in _meta) continue;
  _meta[cfg.currency] = {
    symbol: cfg.symbol ?? cfg.currency,
    locale: cfg.locale ?? 'en-US',
    decimals: cfg.decimals ?? 2,
  };
}
if (_meta.USD) _meta.USD.locale = 'en-US';

/**
 * Formats a monetary amount using symbol, locale and decimal count from
 * COUNTRY_CONFIG. Number-locale rules mirror formatPrice for consistency:
 *   • USD            → en-US  (comma-thousands, dot-decimal)
 *   • Zero-decimal   → es-CL  (dot-thousands, no decimal)
 *   • Two-decimal    → currency's own locale (NIO→es-NI dot-decimal, PEN→es-PE, etc.)
 *
 * Examples:
 *   formatMoney(3000,    'CLP') → "$ 3.000"
 *   formatMoney(3000,    'ARS') → "$ 3.000"
 *   formatMoney(195,     'NIO') → "C$ 195.00"
 *   formatMoney(1234.56, 'NIO') → "C$ 1,234.56"
 *   formatMoney(195,     'PEN') → "S/ 195.00"
 *   formatMoney(195,     'MXN') → "$ 195.00"
 *   formatMoney(195,     'USD') → "US$ 195.00"
 *   formatMoney(3000,    'PYG') → "₲ 3.000"
 *   formatMoney(3000,    'UYU') → "$U 3.000"
 *
 * @param {number} n
 * @param {string} [currency] - ISO 4217
 * @returns {string}
 */
export function formatMoney(n, currency = 'CLP') {
  const cur = String(currency || 'CLP').trim().toUpperCase();
  const cfg = _meta[cur];

  if (!cfg) {
    // Unknown currency: Intl fallback (may output ISO code as symbol)
    try {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n || 0);
    } catch {
      return String(n || 0);
    }
  }

  const { symbol, decimals } = cfg;
  let locale;
  if (cur === 'USD') locale = 'en-US';
  else if (decimals === 0) locale = 'es-CL';
  else locale = cfg.locale || 'en-US';

  const value = decimals === 0 ? Math.round(n || 0) : (n || 0);
  const numStr = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  }).format(value);
  return `${symbol} ${numStr}`;
}

/** Alias CLP puro — retro-compatible con fmtCLP existente. */
export const fmtCLP = (n) => formatMoney(n, 'CLP');

/**
 * Formatea una cadena de dígitos crudos para mostrar en inputs monetarios.
 * Sólo aplica separadores de miles; no agrega símbolo ni decimales.
 *   '' | '0'  → ''
 *   '1000'    → '1.000'
 *   '1500000' → '1.500.000'
 */
export function fmtMoneyInput(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const n = typeof raw === 'number' ? raw : parseInt(String(raw).replace(/\D/g, ''), 10);
  if (!n || isNaN(n)) return '';
  return n.toLocaleString('es-CL');
}

/**
 * Extrae el valor numérico entero desde una cadena formateada o de dígitos.
 * Uso: en onChange de inputs monetarios.
 *   '1.500.000' → 1500000
 *   '1000'      → 1000
 *   ''          → 0
 */
export function parseMoneyInput(val) {
  return parseInt(String(val || '').replace(/\D/g, ''), 10) || 0;
}
