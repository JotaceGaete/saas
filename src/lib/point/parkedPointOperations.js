// Cobros Point «pendientes de verificación» en este equipo.
//
// Cuando la Point o Mercado Pago no responden, el cajero puede dejar el cobro
// pendiente y seguir atendiendo. La operación NO se cancela ni se borra: queda
// en el servidor (crm_pos_point_operations) con su order de Mercado Pago, y
// mp-point-reconcile la resuelve. Si el pago se aprobó, el servidor registra la
// venta desde su sale_snapshot (crm_finalize_point_sale), una sola vez.
//
// Esta lista solo recuerda qué operaciones seguir consultando desde este TPV
// (también tras recargar). No es autoridad: el estado real se pide al servidor.

const PREFIX = 'walinka:point-parked:';
const MAX_ENTRIES = 20;

function storeOf(storage) {
  if (storage) return storage;
  try { return typeof window !== 'undefined' ? window.localStorage : null; } catch { return null; }
}

export function parkedPointKey(businessId) {
  return businessId ? `${PREFIX}${businessId}` : null;
}

export function listParkedPointOperations(businessId, { storage } = {}) {
  const s = storeOf(storage);
  const key = parkedPointKey(businessId);
  if (!s || !key) return [];
  try {
    const list = JSON.parse(s.getItem(key) || '[]');
    return Array.isArray(list) ? list.filter((e) => e && typeof e.operation_id === 'string') : [];
  } catch {
    return [];
  }
}

function write(s, key, list) {
  try {
    if (list.length === 0) s.removeItem(key);
    else s.setItem(key, JSON.stringify(list.slice(-MAX_ENTRIES)));
  } catch { /* almacenamiento no disponible: el servidor sigue siendo la autoridad */ }
}

export function parkPointOperation(businessId, entry, { storage } = {}) {
  const s = storeOf(storage);
  const key = parkedPointKey(businessId);
  if (!s || !key || !entry?.operation_id) return listParkedPointOperations(businessId, { storage });
  const list = listParkedPointOperations(businessId, { storage }).filter((e) => e.operation_id !== entry.operation_id);
  list.push({ parkedAt: new Date().toISOString(), status: 'unknown', ...entry });
  write(s, key, list);
  return listParkedPointOperations(businessId, { storage });
}

export function updateParkedPointOperation(businessId, operationId, patch, { storage } = {}) {
  const s = storeOf(storage);
  const key = parkedPointKey(businessId);
  if (!s || !key) return [];
  const list = listParkedPointOperations(businessId, { storage })
    .map((e) => (e.operation_id === operationId ? { ...e, ...patch } : e));
  write(s, key, list);
  return list;
}

export function removeParkedPointOperation(businessId, operationId, { storage } = {}) {
  const s = storeOf(storage);
  const key = parkedPointKey(businessId);
  if (!s || !key) return [];
  const list = listParkedPointOperations(businessId, { storage }).filter((e) => e.operation_id !== operationId);
  write(s, key, list);
  return list;
}

/** Estados de Mercado Pago con los que el cobro ya no puede convertirse en venta. */
export const POINT_TERMINAL_NO_SALE = Object.freeze(new Set(['failed', 'expired', 'canceled', 'refunded']));
