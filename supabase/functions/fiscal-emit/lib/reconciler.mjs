// Reconciliación manual de un 'unknown' con evidencia verificable.
//
// NO es parte de la API pública: ningún handler HTTP lo importa (ver test que lo verifica).
// Falla cerrado: sin una función authorize explícita no se construye, y la función por defecto
// no existe. Los permisos tributarios específicos aún no están definidos; por eso authorize
// debe venir de quien integre el módulo, y se decide caso por caso.
//
// authorize({ actorUserId, role, businessId, saleId, evidence }) -> boolean (true = autorizado).
// 'role' es el rol fiscal activo del usuario en el negocio (ya verificado como no nulo).
// Cualquier excepción o valor distinto de true se trata como denegado.

import { FiscalError } from './errors.mjs';
import { normalizeEvidence } from './evidence.mjs';
import { operationIdFor } from './emit.mjs';

export function createReconciler({ store, authorize }) {
  if (!store) throw new Error('store is required');
  if (typeof authorize !== 'function') {
    throw new Error('reconciler requires an explicit authorize function (fail-closed)');
  }

  async function reconcile({ actorUserId, saleId, evidence }) {
    if (!saleId || !actorUserId) throw new FiscalError('SALE_NOT_FOUND');
    const sale = await store.loadSaleById(saleId);
    if (!sale) throw new FiscalError('SALE_NOT_FOUND');
    // Tenant por rol activo en el negocio (no por wa_businesses.user_id).
    const role = await store.loadActorRole(sale.businessId, actorUserId);
    if (!role) throw new FiscalError('SALE_NOT_FOUND');

    // Autorización explícita, después de validar tenant y antes de tocar el ledger.
    let allowed = false;
    try {
      allowed = (await authorize({ actorUserId, role, businessId: sale.businessId, saleId: sale.id, evidence })) === true;
    } catch {
      allowed = false;
    }
    if (!allowed) throw new FiscalError('RECONCILIATION_NOT_AUTHORIZED');

    const row = await store.getIssuance(sale.businessId, sale.id);
    if (!row || row.status !== 'unknown') throw new FiscalError('NOT_UNKNOWN');

    const ev = normalizeEvidence(evidence);
    const operationId = operationIdFor(sale.businessId, sale.id);
    const ok = await store.reconcileWithEvidence(sale.businessId, sale.id, operationId, ev);
    if (!ok) throw new FiscalError('RECONCILE_REJECTED');
    return { status: ev.outcome, folio: ev.folio ?? null, providerCalls: 0 };
  }

  return Object.freeze({ reconcile });
}
