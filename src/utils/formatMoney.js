/**
 * formatMoney — única función de formato monetario para todo el CRM.
 *
 * Usa locale es-CL: separador de miles = '.', sin decimales para CLP.
 * Para otras monedas (ARS, USD) aplica la misma presentación sin decimales.
 *
 * CURRENCY_SYMBOL_OVERRIDE: cuando Intl.NumberFormat no produce el símbolo
 * esperado para una moneda (ej. NIO → "C$" en lugar de "NIO"), se construye
 * el string manualmente con el símbolo correcto.
 */
const CURRENCY_SYMBOL_OVERRIDE = Object.freeze({
  NIO: 'C$',
});

export function formatMoney(n, currency = 'CLP') {
  const override = CURRENCY_SYMBOL_OVERRIDE[currency];
  if (override) {
    const formatted = new Intl.NumberFormat('es-CL', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n || 0);
    return `${override} ${formatted}`;
  }
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency || 'CLP',
    maximumFractionDigits: 0,
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
