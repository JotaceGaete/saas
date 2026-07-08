// Lógica pura del arqueo de caja (efectivo esperado vs. contado).
// Sin dependencias de React/Supabase para poder testearla de forma aislada.

function toNumber(value) {
  return Number(value || 0);
}

// Efectivo físico esperado al cierre:
// solo cobros en efectivo + movimientos manuales de caja (sin método o método=cash).
// Los cobros por tarjeta/transferencia NO afectan el efectivo físico.
export function computeExpectedCash(session, payments = [], movements = []) {
  const initial    = toNumber(session?.initial_amount);
  const cashIn     = payments
    .filter(p => !p.voided_at && p.payment_method === 'cash')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  const manualIn   = movements
    .filter(m => !m.voided_at && m.direction === 'in' && (!m.payment_method || m.payment_method === 'cash'))
    .reduce((s, m) => s + toNumber(m.amount), 0);
  const manualOut  = movements
    .filter(m => !m.voided_at && m.direction === 'out' && (!m.payment_method || m.payment_method === 'cash'))
    .reduce((s, m) => s + toNumber(m.amount), 0);
  return initial + cashIn + manualIn - manualOut;
}

// true cuando el efectivo contado coincide con el esperado (arqueo cuadrado).
export function isCashBalanced(diff) {
  return diff !== null && diff !== undefined && Number.isFinite(diff) && Math.abs(diff) < 1;
}

// Color/emoji/etiqueta de la diferencia de arqueo para la UI (🟢 cuadra, 🟠/🔴 sobrante o faltante).
export function classifyCashDifference(diff, expected) {
  if (diff === null || diff === undefined || !Number.isFinite(diff)) {
    return { emoji: '', color: 'text-gray-400', label: '' };
  }
  const abs = Math.abs(diff);
  const severe = abs >= toNumber(expected) * 0.05;
  return {
    emoji: isCashBalanced(diff) ? '🟢' : severe ? '🔴' : '🟠',
    color: isCashBalanced(diff) ? 'text-emerald-600' : severe ? 'text-red-600' : 'text-amber-600',
    label: diff > 0 ? 'sobrante' : diff < 0 ? 'faltante' : 'cuadra',
  };
}

// Resumen de arqueo de una caja ya cerrada, para mostrar en el detalle/historial.
// Devuelve null si la caja se cerró antes de que existiera el arqueo (sin counted_cash registrado).
export function getArqueoSummary(session) {
  if (!session || session.counted_cash === null || session.counted_cash === undefined) {
    return null;
  }
  const expected = toNumber(session.expected_cash);
  const counted  = toNumber(session.counted_cash);
  const diff     = session.cash_difference !== null && session.cash_difference !== undefined
    ? toNumber(session.cash_difference)
    : counted - expected;
  return {
    expected,
    counted,
    diff,
    notes: session.closing_notes || null,
    balanced: isCashBalanced(diff),
    ...classifyCashDifference(diff, expected),
  };
}

// Recalcula la diferencia al corregir el efectivo contado de una caja ya cerrada.
// expected_cash nunca se recalcula: es la fotografía fija tomada en el cierre original.
export function recalcArqueoOnCorrection(expectedCash, newCountedCash) {
  const expected = toNumber(expectedCash);
  const counted  = toNumber(newCountedCash);
  const diff     = counted - expected;
  return {
    expected,
    counted,
    diff,
    balanced: isCashBalanced(diff),
    ...classifyCashDifference(diff, expected),
  };
}
