// Ventas cobradas cuya boleta todavía no terminó en este equipo (no se emitió,
// quedó incierta o no se imprimió). Si el TPV se cierra o se recarga, el
// cajero las recupera desde el TPV y el flujo fiscal (fiscalSaleFlow) decide
// qué falta, con sus reglas: nunca reenvía una emisión incierta, nunca emite
// dos veces una venta y el original se imprime con la misma clave del
// conector (sin duplicar papel ni folio).
//
// Solo guarda lo necesario para volver a abrir la venta en el TPV; nunca
// pagos nuevos. Máximo 20 por negocio.

const MAX = 20;
const keyFor = (businessId) => `walinka:fiscal-pending:${businessId}`;

function read(storage, businessId) {
  try {
    const list = JSON.parse(storage.getItem(keyFor(businessId)));
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function write(storage, businessId, list) {
  try { storage.setItem(keyFor(businessId), JSON.stringify(list.slice(-MAX))); } catch { /* sin almacenamiento */ }
}

const storeOf = (storage) => storage || globalThis.localStorage;

/** ticketData del TPV: { sale: { id, invoice_number }, items, payments, total, ... } */
export function savePendingFiscalSale(businessId, ticketData, { storage } = {}) {
  const s = storeOf(storage);
  const saleId = ticketData?.sale?.id;
  if (!s || !businessId || !saleId) return;
  const list = read(s, businessId).filter((p) => p.saleId !== saleId);
  list.push({ saleId: String(saleId), savedAt: new Date().toISOString(), ticketData });
  write(s, businessId, list);
}

export function clearPendingFiscalSale(businessId, saleId, { storage } = {}) {
  const s = storeOf(storage);
  if (!s || !businessId || !saleId) return;
  write(s, businessId, read(s, businessId).filter((p) => p.saleId !== String(saleId)));
}

export function listPendingFiscalSales(businessId, { storage } = {}) {
  const s = storeOf(storage);
  if (!s || !businessId) return [];
  return read(s, businessId);
}

/** Fases del flujo con las que la venta ya no necesita recuperación. */
export const SETTLED_PHASES = Object.freeze(new Set(['printed', 'not_eligible', 'rejected']));
