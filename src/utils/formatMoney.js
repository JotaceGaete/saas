/**
 * formatMoney — formato monetario para módulos CRM.
 *
 * Usa COUNTRY_CONFIG como fuente de verdad: locale, símbolo y decimales
 * se resuelven por moneda en lugar de forzar siempre es-CL.
 */
import { COUNTRY_CONFIG } from '../config/countryConfig';

// Derive locale and decimal rules from COUNTRY_CONFIG once at module load.
const _localeMap = Object.create(null);
const _decimalsMap = Object.create(null);
for (const cfg of Object.values(COUNTRY_CONFIG)) {
  if (!cfg.currency) continue;
  if (!(cfg.currency in _localeMap) && cfg.locale) _localeMap[cfg.currency] = cfg.locale;
  if (!(cfg.currency in _decimalsMap) && cfg.decimals !== undefined) _decimalsMap[cfg.currency] = cfg.decimals;
}
// USD formatted with en-US locale regardless of which country entry came first.
_localeMap['USD'] = 'en-US';

/**
 * Formats a monetary amount for display using the correct locale and decimal
 * count for the given currency code.
 *
 * Examples (all correct):
 *   formatMoney(3000,  'CLP') → "$ 3.000"
 *   formatMoney(3000,  'ARS') → "$ 3.000"
 *   formatMoney(195,   'NIO') → "C$ 195,00"
 *   formatMoney(25.5,  'PEN') → "S/ 25,50"
 *   formatMoney(19.99, 'MXN') → "$ 19.99"
 *   formatMoney(19.99, 'USD') → "US$ 19.99"
 *
 * @param {number} n
 * @param {string} [currency]
 * @returns {string}
 */
export function formatMoney(n, currency = 'CLP') {
  const cur = String(currency || 'CLP').trim().toUpperCase();
  const locale = _localeMap[cur] || 'es-CL';
  const decimals = _decimalsMap[cur] ?? 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(decimals === 0 ? Math.round(n || 0) : (n || 0));
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
