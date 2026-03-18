/**
 * Formato de precios para Chile (CLP).
 * - Símbolo $, espacio, punto como separador de miles, sin decimales.
 * Ejemplo: formatCLP(150000) => "$ 150.000"
 */

/**
 * Formatea un monto como precio CLP para mostrar en la UI.
 * @param {number|string} amount - Monto (entero; se redondea si tiene decimales)
 * @returns {string} Ej: "$ 150.000"
 */
export function formatCLP(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return '$ 0';
  const integer = Math.round(n);
  const str = String(integer);
  const withDots = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${withDots}`;
}

/**
 * Formatea un valor numérico para mostrar en el input de precio (separador de miles).
 * @param {number|string} value - Valor entero o string numérico
 * @returns {string} Ej: "150.000" o "" si vacío/inválido
 */
export function formatCLPInput(value) {
  if (value === '' || value === null || value === undefined) return '';
  const n = typeof value === 'number' ? value : Number(String(value).replace(/\D/g, ''));
  if (Number.isNaN(n)) return '';
  const integer = Math.round(n);
  const str = String(integer);
  return str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Parsea el texto del input de precio a número entero (sin formato).
 * @param {string} str - Texto con o sin puntos, ej: "150.000" o "150000"
 * @returns {number|''} Entero para guardar en BD o '' si vacío
 */
export function parseCLPInput(str) {
  if (str === '' || str === null || str === undefined) return '';
  const digits = String(str).replace(/\D/g, '');
  if (digits === '') return '';
  return parseInt(digits, 10);
}

// --- ARS (Argentina) y helper por moneda ---

/**
 * Formatea un monto como precio ARS para mostrar en la UI.
 * @param {number|string} amount
 * @returns {string} Ej: "$ 15.000"
 */
export function formatARS(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return '$ 0';
  const integer = Math.round(n);
  const str = String(integer);
  const withDots = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${withDots}`;
}

/**
 * Formatea un monto como precio USD para mostrar en la UI.
 * @param {number|string} amount
 * @returns {string} Ej: "US$ 15.00"
 */
export function formatUSD(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return 'US$ 0.00';
  return `US$ ${Number(n).toFixed(2)}`;
}

/**
 * Formatea un monto en MXN (pesos mexicanos).
 * @param {number|string} amount
 * @returns {string}
 */
export function formatMXN(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return '$ 0';
  const integer = Math.round(n);
  const str = String(integer);
  const withDots = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${withDots}`;
}

/**
 * Formatea un monto en COP (pesos colombianos).
 * @param {number|string} amount
 * @returns {string}
 */
export function formatCOP(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return '$ 0';
  const integer = Math.round(n);
  const str = String(integer);
  const withDots = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$ ${withDots}`;
}

/**
 * Formatea un monto en PEN (soles peruanos).
 * @param {number|string} amount
 * @returns {string}
 */
export function formatPEN(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return 'S/ 0';
  const integer = Math.round(n);
  const str = String(integer);
  const withDots = str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `S/ ${withDots}`;
}

/**
 * Formatea un monto en EUR.
 * @param {number|string} amount
 * @returns {string}
 */
export function formatEUR(amount) {
  const n = typeof amount === 'number' ? amount : Number(amount);
  if (Number.isNaN(n) || n < 0) return '€ 0,00';
  return `€ ${Number(n).toFixed(2).replace('.', ',')}`;
}

/**
 * Formatea un monto según la moneda (CLP, ARS, USD, MXN, COP, PEN, EUR).
 * @param {number|string} amount
 * @param {string} [currency] - Código ISO (CLP, ARS, USD, MXN, COP, PEN, EUR)
 * @returns {string}
 */
export function formatCurrency(amount, currency) {
  const c = (currency || 'CLP').toUpperCase();
  if (c === 'ARS') return formatARS(amount);
  if (c === 'USD') return formatUSD(amount);
  if (c === 'MXN') return formatMXN(amount);
  if (c === 'COP') return formatCOP(amount);
  if (c === 'PEN') return formatPEN(amount);
  if (c === 'EUR') return formatEUR(amount);
  return formatCLP(amount);
}
