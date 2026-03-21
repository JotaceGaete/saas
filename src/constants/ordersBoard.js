/**
 * Tablero activo (/orders): ventana de visibilidad solo en frontend para pedidos entregados.
 * No afecta API ni historial.
 */
export const ACTIVE_DELIVERED_VISIBILITY_MINUTES = 60;

/**
 * Marca temporal usada para saber si un entregado sigue visible en el tablero.
 * Prioridad: deliveredAt → updatedAt → createdAt
 * @returns {number|null} epoch ms o null si no hay fecha usable
 */
export function getDeliveredVisibilityTimestampMs(order) {
  if ((order?.status || '') !== 'entregado') return null;
  const candidates = [order?.deliveredAt, order?.updatedAt, order?.createdAt];
  for (const raw of candidates) {
    if (raw == null) continue;
    const t = new Date(raw);
    if (!Number.isNaN(t.getTime())) return t.getTime();
  }
  return null;
}

/**
 * Si el pedido no es entregado, siempre visible en tablero.
 * Si es entregado: visible solo si la marca está dentro de la ventana (minutos).
 * Si no hay fecha válida, se muestra (comportamiento conservador).
 */
export function isOrderVisibleOnActiveBoard(order, minutes = ACTIVE_DELIVERED_VISIBILITY_MINUTES) {
  if ((order?.status || '') !== 'entregado') return true;
  const ms = getDeliveredVisibilityTimestampMs(order);
  if (ms == null) return true;
  const windowMs = Math.max(1, Number(minutes) || 0) * 60 * 1000;
  return Date.now() - ms <= windowMs;
}
