import { COUNTRY_CONFIG } from '../config/countryConfig';

const LOCALE_BY_CURRENCY = Object.freeze({
  CLP: 'es-CL', ARS: 'es-AR', BOB: 'es-BO', COP: 'es-CO', CRC: 'es-CR',
  DOP: 'es-DO', EUR: 'es-ES', GTQ: 'es-GT', HNL: 'es-HN', MXN: 'es-MX',
  NIO: 'es-NI', PEN: 'es-PE', PYG: 'es-PY', USD: 'en-US', UYU: 'es-UY',
});

const ZERO_DECIMAL = new Set(['CLP', 'ARS', 'CRC', 'COP', 'GTQ', 'PYG', 'UYU', 'BOB']);

function resolveLocale(currency, countryCode) {
  if (countryCode) {
    const cfg = COUNTRY_CONFIG[String(countryCode).toUpperCase()];
    if (cfg?.locale) return cfg.locale;
  }
  return LOCALE_BY_CURRENCY[String(currency || 'CLP').toUpperCase()] || 'es-CL';
}

/**
 * Formatea un monto en la moneda del negocio con el locale correcto.
 * @param {number} n
 * @param {string} [currency] - ISO 4217 (CLP, NIO, HNL, etc.)
 * @param {string} [countryCode] - ISO 3166-1 alpha-2 (CL, NI, HN, etc.)
 */
export function formatMoney(n, currency = 'CLP', countryCode = null) {
  const cur = String(currency || 'CLP').toUpperCase();
  const loc = resolveLocale(cur, countryCode);
  const zeroDecimal = ZERO_DECIMAL.has(cur);
  return new Intl.NumberFormat(loc, {
    style: 'currency',
    currency: cur,
    minimumFractionDigits: zeroDecimal ? 0 : 2,
    maximumFractionDigits: zeroDecimal ? 0 : 2,
  }).format(n || 0);
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
