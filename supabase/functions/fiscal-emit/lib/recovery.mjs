// Recuperación de operaciones que quedaron en 'sending' (caída del proceso, o error al persistir).
//
// Garantías:
//  - NO recibe proveedor. Es imposible que llame a DTECore desde aquí (ver test de firma).
//  - NUNCA reemite ni pasa a 'pending'. Una fila vencida con recibo se finaliza como 'issued'
//    desde el recibo guardado; una fila vencida SIN recibo pasa a 'unknown'.
//  - 'unknown' NO significa "no existe": significa "no sabemos". Solo la reconciliación con
//    evidencia (lib/reconciler.mjs) puede resolverlo.
//  - Idempotente: una segunda pasada no cambia nada que la primera no haya cambiado.
//  - Solo actúa sobre filas vencidas (updated_at < now - staleAfterMs). El umbral debe ser mucho
//    mayor que el tiempo máximo de una emisión en curso; por eso hay un mínimo.

export const MIN_STALE_AFTER_MS = 5 * 60_000;

export function createRecovery({ store, now = () => new Date(), staleAfterMs = 15 * 60_000 }) {
  if (!store) throw new Error('store is required');
  if (!Number.isFinite(staleAfterMs) || staleAfterMs < MIN_STALE_AFTER_MS) {
    throw new Error(`staleAfterMs must be at least ${MIN_STALE_AFTER_MS} ms`);
  }

  async function recoverStaleSending() {
    const before = new Date(now().getTime() - staleAfterMs);
    const rows = await store.listStaleSending(before);
    const report = { examined: rows.length, finalizedFromReceipt: 0, markedUnknown: 0, untouched: 0 };

    for (const row of rows) {
      const fromReceipt = await store.finalizeFromReceipt(row.businessId, row.saleId, row.operationId);
      if (fromReceipt) {
        report.finalizedFromReceipt += 1;
        continue;
      }
      // Sin recibo: unknown. El almacén rechaza si entretanto apareció un recibo o la fila ya no es vencida.
      const unknown = await store.markStaleUnknown(row.businessId, row.saleId, row.operationId, before);
      if (unknown) report.markedUnknown += 1;
      else report.untouched += 1;
    }
    return report;
  }

  return Object.freeze({ recoverStaleSending });
}
