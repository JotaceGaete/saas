/**
 * periodReportPresets.js — REPORTES-PERIODO-1.
 *
 * Mapeo puro (sin supabase, sin React) de un preset del selector de período
 * a un rango [from, to] concreto. Vive fuera de crmService.js porque es
 * presentación/UI (qué botones mostrar, qué rango arma cada uno), no una
 * regla financiera -- las reglas financieras (getPeriodSummary,
 * computeComparisonPeriod, computePeriodComparison) están todas en
 * crmService.js, la única fuente de verdad.
 *
 * Convención de "hasta hoy" (deliberada, documentada acá): para presets que
 * incluyen el día de hoy (Esta semana, Este mes, Últimos 7/30 días), `to`
 * SIEMPRE es la fecha de hoy, nunca el final "natural" del período (p. ej.
 * "Esta semana" no incluye días futuros de la semana en curso) -- mismo
 * criterio que ya usa DateSelector de Resumen del día (max={today}). Los
 * presets de período CERRADO (Ayer, Semana anterior, Mes anterior) sí usan
 * su rango completo real, porque son 100% pasado.
 *
 * Semana: lunes a domingo (convención de negocio en Chile/Argentina).
 */
import { getLocalDateString } from 'services/crmService';

function shiftDateStr(dateStr, deltaDays) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + deltaDays));
  return dt.toISOString().slice(0, 10);
}

// getDay(): 0=domingo..6=sábado. Convierte a offset ISO (lunes=0..domingo=6).
function isoWeekdayOffset(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dow = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay();
  return (dow + 6) % 7;
}

function mondayOf(dateStr) {
  return shiftDateStr(dateStr, -isoWeekdayOffset(dateStr));
}

function firstOfMonth(dateStr) {
  const [y, m] = String(dateStr).split('-').map(Number);
  return `${y}-${String(m).padStart(2, '0')}-01`;
}

function lastOfMonth(dateStr) {
  const [y, m] = String(dateStr).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function firstOfPrevMonth(dateStr) {
  const [y, m] = String(dateStr).split('-').map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  return `${py}-${String(pm).padStart(2, '0')}-01`;
}

function lastOfPrevMonth(dateStr) {
  return shiftDateStr(firstOfMonth(dateStr), -1);
}

export const PERIOD_PRESETS = [
  { key: 'today', label: 'Hoy' },
  { key: 'yesterday', label: 'Ayer' },
  { key: 'thisWeek', label: 'Esta semana' },
  { key: 'lastWeek', label: 'Semana anterior' },
  { key: 'thisMonth', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes anterior' },
  { key: 'last7', label: 'Últimos 7 días' },
  { key: 'last30', label: 'Últimos 30 días' },
  { key: 'custom', label: 'Personalizado' },
];

/**
 * Resuelve un preset a un rango [from, to] concreto. `today` es inyectable
 * para tests deterministas -- por defecto usa getLocalDateString() (mismo
 * criterio de fecha que el resto del CRM).
 */
export function getPresetRange(presetKey, today = getLocalDateString()) {
  switch (presetKey) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = shiftDateStr(today, -1);
      return { from: y, to: y };
    }
    case 'thisWeek':
      return { from: mondayOf(today), to: today };
    case 'lastWeek': {
      const thisMonday = mondayOf(today);
      const lastSunday = shiftDateStr(thisMonday, -1);
      const lastMonday = shiftDateStr(lastSunday, -6);
      return { from: lastMonday, to: lastSunday };
    }
    case 'thisMonth':
      return { from: firstOfMonth(today), to: today };
    case 'lastMonth':
      return { from: firstOfPrevMonth(today), to: lastOfPrevMonth(today) };
    case 'last7':
      return { from: shiftDateStr(today, -6), to: today };
    case 'last30':
      return { from: shiftDateStr(today, -29), to: today };
    default:
      return null; // 'custom' (o desconocido): el llamador provee from/to manualmente.
  }
}
