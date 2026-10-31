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
//
// Este camino genérico queda para pruebas y para integraciones que decidan su propia autorización.
// El flujo administrativo de producción es createAdminReconciler (abajo).

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

// Flujo administrativo de reconciliación (PR #108, sección 3).
//
// Una sola transacción en la base (public.crm_fiscal_reconcile_admin): rol fiscal_reconciler,
// revisor = actor, evidencia y auditoría 'applied' se confirman juntos o no se confirma nada.
//
// Resultados, sin ambigüedad:
//  - Éxito: la RPC devolvió true; evidencia y auditoría existen.
//  - Error de dominio (FISCAL_*): la RPC lanzó excepción y la transacción se revirtió. Nada cambió.
//    Se audita el rechazo en una escritura aparte (mejor esfuerzo; no altera estado).
//  - Cualquier otro error (red, respuesta perdida, timeout): el resultado es DESCONOCIDO. La RPC
//    puede haberse confirmado. No se registra como rechazo ni como aplicado; se devuelve
//    RECONCILE_OUTCOME_UNKNOWN y hay que leer el estado de la venta antes de decidir nada.
export function createAdminReconciler({ store }) {
  if (!store) throw new Error('store is required');

  // Códigos de dominio de la base -> código público estable.
  const PUBLIC_CODE = {
    FISCAL_RECONCILIATION_NOT_AUTHORIZED: 'RECONCILIATION_NOT_AUTHORIZED',
    FISCAL_REVIEWER_MISMATCH: 'EVIDENCE_REVIEWER_MISMATCH',
    FISCAL_NOT_RECONCILABLE: 'NOT_UNKNOWN',
  };
  const OUTCOME_FOR = {
    FISCAL_RECONCILIATION_NOT_AUTHORIZED: 'denied_no_reconciler_role',
    FISCAL_REVIEWER_MISMATCH: 'denied_reviewer_mismatch',
  };

  // Auditoría de rechazos: no cambia estado, así que su fallo no debe cambiar la respuesta.
  async function auditBestEffort(entry) {
    try {
      await store.appendAudit(entry);
    } catch {
      /* el rechazo ya está decidido; la falta de esta fila no altera la venta */
    }
  }

  async function reconcile({ actorUserId, saleId, evidence }) {
    if (!saleId || !actorUserId) throw new FiscalError('SALE_NOT_FOUND');
    const sale = await store.loadSaleById(saleId);
    if (!sale) throw new FiscalError('SALE_NOT_FOUND');
    const member = await store.loadActorRole(sale.businessId, actorUserId);
    if (!member) throw new FiscalError('SALE_NOT_FOUND');

    const base = { businessId: sale.businessId, saleId: sale.id, actorUserId };
    const summary = { outcome: evidence?.outcome ?? null, evidenceReference: evidence?.evidenceReference ?? null };

    // Identidad: nadie firma por otro. La RPC vuelve a comprobarla dentro de la transacción.
    if (typeof evidence?.reviewerUserId !== 'string' || evidence.reviewerUserId !== actorUserId) {
      await auditBestEffort({ ...base, action: 'reconcile_result', outcome: 'denied_reviewer_mismatch', detail: summary });
      throw new FiscalError('EVIDENCE_REVIEWER_MISMATCH');
    }

    // Evidencia inválida: se rechaza antes de tocar la base; no hay nada que revertir.
    const ev = normalizeEvidence(evidence);
    const operationId = operationIdFor(sale.businessId, sale.id);

    try {
      await store.reconcileAdmin(sale.businessId, sale.id, operationId, actorUserId, ev);
    } catch (err) {
      if (err instanceof FiscalError) {
        // Dominio: la transacción se revirtió por completo. Nada se aplicó.
        await auditBestEffort({
          ...base,
          action: 'reconcile_result',
          outcome: OUTCOME_FOR[err.code] ?? 'rejected',
          detail: { ...summary, code: err.code },
        });
        throw new FiscalError(PUBLIC_CODE[err.code] ?? err.code);
      }
      // Resultado desconocido: se registra solo que hubo un intento sin resultado confirmado.
      await auditBestEffort({ ...base, action: 'reconcile_attempt', outcome: 'response_lost', detail: summary });
      throw new FiscalError('RECONCILE_OUTCOME_UNKNOWN', 'reconciliation outcome unknown; read the sale state before retrying');
    }
    return { status: ev.outcome, folio: ev.folio ?? null, providerCalls: 0 };
  }

  return Object.freeze({ reconcile });
}
