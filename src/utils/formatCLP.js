/**
 * Formato de precios y montos por moneda/locale (Intl).
 * Nombre histórico "formatCLP": muchos imports siguen usando este archivo.
 *
 * Los mapas de locale y decimales se derivan de COUNTRY_CONFIG para mantener
 * una única fuente de verdad. Agregar un nuevo país al config propaga
 * automáticamente a todas las funciones de formato.
 */

import { COUNTRY_CONFIG } from '../config/countryConfig';

// Derive locale and zero-decimal rules from COUNTRY_CONFIG.
// When multiple countries share a currency the first entry wins; USD is
// overridden to 'en-US' explicitly so it doesn't pick up 'es-EC'.
const _localeMap = Object.create(null);
const _zeroDecimal = new Set();
for (const cfg of Object.values(COUNTRY_CONFIG)) {
  if (!cfg.currency) continue;
  if (!(cfg.currency in _localeMap) && cfg.locale) _localeMap[cfg.currency] = cfg.locale;
  if (cfg.decimals === 0) _zeroDecimal.add(cfg.currency);
}
_localeMap['USD'] = 'en-US';

/** Locale BCP-47 inferido por código de moneda. Exportado para reutilización. */
export const FALLBACK_LOCALE_BY_CURRENCY = Object.freeze({ ..._localeMap });

/** Monedas sin decimales en su uso comercial habitual. Exportado para reutilización. */
export const ZERO_DECIMAL_CURRENCIES = Object.freeze(_zeroDecimal);

/**
 * @param {number|string} amount
 * @param {string} [currency] - ISO 4217
 * @param {string} [locale] - BCP 47 (preferir el del negocio vía getBusinessLocale / getCountryMoneyFormat)
 * @returns {string}
 */
export function formatCurrency(amount, currency, locale) {
  const cur = (currency || 'USD').toUpperCase();
  const loc = locale || FALLBACK_LOCALE_BY_CURRENCY[cur] || 'en-US';
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;
  const zeroDecimal = _zeroDecimal.has(cur);
  const opts = {
    style: 'currency',
    currency: cur,
    ...(zeroDecimal && { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
  };
  try {
    return new Intl.NumberFormat(loc, opts).format(zeroDecimal ? Math.round(value) : value);
  } catch {
    try {
      return new Intl.NumberFormat('en-US', opts).format(zeroDecimal ? Math.round(value) : value);
    } catch {
      return String(value);
    }
  }
}

/**
 * Precios de suscripción en /planes: USD con prefijo "US$" explícito; otras monedas con Intl local.
 * Evita confundir con símbolos de moneda local del país (ej. CRC) cuando el cobro es en USD.
 * @param {number|string} amount
 * @param {string} currencyCode
 * @param {string} [locale]
 */
export function formatSubscriptionPlanPrice(amount, currencyCode, locale) {
  const c = String(currencyCode || 'USD').toUpperCase();
  const n = Number(amount);
  const value = Number.isFinite(n) && n >= 0 ? n : 0;
  if (c === 'USD') {
    const fractionDigits = value % 1 === 0 ? 0 : 2;
    const num = new Intl.NumberFormat('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: 2,
    }).format(value);
    return `US$ ${num}`;
  }
  const loc = locale || FALLBACK_LOCALE_BY_CURRENCY[c] || 'en-US';
  return formatCurrency(value, c, loc);
}

/**
 * Enteros con separadores de miles según locale (inputs de precio en editor).
 * @param {number|string} value
 * @param {string} [locale]
 */
export function formatIntegerInputGrouped(value, locale = 'es-CL') {
  if (value === '' || value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, ''));
  if (Number.isNaN(n)) return '';
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, useGrouping: true }).format(Math.round(n));
}

/**
 * @deprecated Preferir formatCurrency(..., 'CLP', 'es-CL') o formatCurrency con datos del negocio.
 */
export function formatCLP(amount) {
  return formatCurrency(amount, 'CLP', 'es-CL');
}

/**
 * Formatea un valor numérico para mostrar en el input de precio (separador de miles según locale).
 * @deprecated Usar formatIntegerInputGrouped con el locale del negocio.
 */
export function formatCLPInput(value) {
  return formatIntegerInputGrouped(value, 'es-CL');
}

/**
 * Parsea el texto del input de precio a número entero (sin formato).
 */
export function parseCLPInput(str) {
  if (str === '' || str === null || str === undefined) return '';
  const digits = String(str).replace(/\D/g, '');
  if (digits === '') return '';
  return parseInt(digits, 10);
}

export function formatARS(amount) {
  return formatCurrency(amount, 'ARS', 'es-AR');
}

export function formatUSD(amount) {
  return formatCurrency(amount, 'USD', 'en-US');
}

export function formatMXN(amount) {
  return formatCurrency(amount, 'MXN', 'es-MX');
}

export function formatCOP(amount) {
  return formatCurrency(amount, 'COP', 'es-CO');
}

export function formatPEN(amount) {
  return formatCurrency(amount, 'PEN', 'es-PE');
}

export function formatEUR(amount) {
  return formatCurrency(amount, 'EUR', 'es-ES');
}
