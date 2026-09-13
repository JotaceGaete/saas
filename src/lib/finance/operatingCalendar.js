// OPERATING-CALENDAR-1 — calendario operativo semanal del negocio.
//
// Funciones puras, sin dependencias de React/Supabase/DOM, usadas por
// CrmCostCenter.jsx (Termómetro) y CrmCostos.jsx para el MISMO cálculo de
// "cuántos días operativos tiene este mes" y "cuánto costo fijo diario le
// corresponde a cada uno" -- ver auditoría OPERATING-CALENDAR-1: antes de
// esta capa, `CrmCostCenter.jsx` dividía el costo fijo mensual por
// `daysInMonth` (días CALENDARIO), aplicando una cuota de costo fijo
// incluso a domingos/feriados en que el negocio nunca iba a abrir.
//
// Compatibilidad (obligatoria, ver ticket): un negocio SIN
// `wa_businesses.operating_days` configurado (columna NULL) preserva el
// comportamiento histórico exacto -- TODOS los días calendario del mes
// cuentan como operativos. Nunca le "adivinamos" un horario a un negocio
// existente; el comerciante tiene que configurarlo explícitamente en
// Configuración del negocio antes de que el prorrateo cambie.

// Índice = Date.prototype.getDay() (0 = domingo, ..., 6 = sábado).
export const WEEKDAY_KEYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Normaliza el valor crudo de `wa_businesses.operating_days` (JSONB: puede
 * venir con claves faltantes, valores no-booleanos, o ser `null`/
 * `undefined`/un tipo inesperado si el dato está corrupto).
 *
 * @param {unknown} raw
 * @returns {null|Record<typeof WEEKDAY_KEYS[number], boolean>} `null` =
 *   "no configurado" -- modo legacy, ver comentario de archivo. Si no es
 *   `null`, SIEMPRE un objeto con las 7 claves ya resueltas a booleano
 *   (nunca parcial), para que el resto de este módulo no tenga que volver
 *   a validar nada.
 */
export function normalizeOperatingDays(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const normalized = {};
  for (const key of WEEKDAY_KEYS) normalized[key] = Boolean(raw[key]);
  return normalized;
}

/**
 * ¿El negocio opera en `date` según `operatingDays` (crudo o ya
 * normalizado -- se normaliza acá igual, es barato y evita que cada
 * caller tenga que acordarse de hacerlo)? Sin configuración, SIEMPRE
 * `true` -- ver nota de compatibilidad de archivo.
 * @param {unknown} operatingDays
 * @param {Date} date
 */
export function isOperatingDay(operatingDays, date) {
  const normalized = normalizeOperatingDays(operatingDays);
  if (normalized === null) return true;
  return normalized[WEEKDAY_KEYS[date.getDay()]] === true;
}

/**
 * Cantidad de días operativos de `month`/`year` (mes 1-12). Sin
 * configuración, es simplemente la cantidad de días calendario del mes
 * (comportamiento histórico, ver nota de compatibilidad de archivo).
 */
export function getOperatingDaysForMonth(operatingDays, month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const normalized = normalizeOperatingDays(operatingDays);
  if (normalized === null) return daysInMonth;
  let count = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    if (isOperatingDay(normalized, new Date(year, month - 1, day))) count += 1;
  }
  return count;
}

/**
 * Costo fijo mensual total / días operativos del mes. El total mensual
 * NUNCA se altera por esta función -- solo decide cómo se distribuye
 * analíticamente entre los días que el negocio realmente opera. Precisión
 * completa, sin redondear: redondear es responsabilidad exclusiva de la
 * capa de presentación (formatMoney), nunca de este cálculo -- así la
 * suma de todos los días operativos nunca se aleja del total mensual por
 * error de redondeo acumulado.
 *
 * Nunca lanza: con 0 (o menos) días operativos devuelve 0 en vez de
 * Infinity/NaN -- un negocio sin ningún día operativo configurado es un
 * estado inválido que la UI de configuración ya impide guardar (ver
 * OperatingDaysSettings), pero esta función no confía en eso.
 */
export function calculateFixedCostPerOperatingDay(totalMonthlyFixedCosts, operatingDaysInMonth) {
  const total = Number(totalMonthlyFixedCosts) || 0;
  const days = Number(operatingDaysInMonth) || 0;
  return days > 0 ? total / days : 0;
}

/** Validación de la UI de configuración: debe quedar al menos un día operativo marcado. */
export function hasAtLeastOneOperatingDay(operatingDays) {
  const normalized = normalizeOperatingDays(operatingDays);
  if (normalized === null) return true;
  return WEEKDAY_KEYS.some((key) => normalized[key] === true);
}
