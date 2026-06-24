import { applyPriceDisplayMode } from './applyPriceDisplayMode';

/**
 * Currencies that always render without decimals in commercial contexts.
 * Handled with es-CL locale (dot-thousands, no decimal part) to preserve
 * the existing CRM presentation for CLP, ARS and other zero-decimal markets.
 */
const LATAM_ZERO_DECIMAL = new Set(['CLP', 'ARS', 'CRC', 'COP', 'GTQ', 'PYG', 'UYU', 'BOB']);

/**
 * Per-currency BCP 47 locale for non-zero-decimal currencies.
 * Used to resolve the correct currency symbol in all environments
 * (Node.js / Vercel edge ICU may not know symbols via en-US fallback).
 */
const LOCALE_BY_CURRENCY = Object.freeze({
  USD: 'en-US',
  MXN: 'es-MX',
  PEN: 'es-PE',
  EUR: 'es-ES',
  NIO: 'es-NI',
  HNL: 'es-HN',
  DOP: 'es-DO',
  PAB: 'es-PA',
});

/**
 * formatMoney — unified CRM money formatter.
 *
 * Zero-decimal currencies (CLP, ARS, CRC, COP, GTQ, PYG, UYU, BOB):
 *   → "<symbol> <dot-thousands>" with no decimals (es-CL convention)
 *   → unaffected by displayMode — their commercial format never has decimals
 *
 * All other currencies (NIO, USD, PEN, MXN, …):
 *   → formatted with the correct locale (proper symbol, standard decimals)
 *   → displayMode applied via applyPriceDisplayMode
 *
 * @param {number} n
 * @param {string} [currency='CLP'] - ISO 4217
 * @param {string} [displayMode='auto'] - 'auto' | 'always' | 'hide_zero_decimals'
 * @returns {string}
 */
export function formatMoney(n, currency = 'CLP', displayMode = 'auto') {
  const cur = String(currency || 'CLP').trim().toUpperCase();
  const value = Number.isFinite(Number(n)) ? Number(n) : 0;

  let formatted;

  if (LATAM_ZERO_DECIMAL.has(cur)) {
    formatted = new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: cur,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(value));
  } else if (cur === 'USD') {
    // Explicit US$ prefix — en-US locale renders '$' which is ambiguous vs local $ symbols.
    const numStr = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(value);
    formatted = `US$ ${numStr}`;
  } else {
    const locale = LOCALE_BY_CURRENCY[cur] || 'en-US';
    formatted = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
    }).format(value);
  }

  return applyPriceDisplayMode(formatted, value, displayMode);
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
