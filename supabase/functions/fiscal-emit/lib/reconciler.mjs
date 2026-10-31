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
import { RECONCILER_ROLE } from './authz.mjs';

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

// Flujo administrativo de reconciliación (diseño de PR #108, sección 3):
//  1) Tenant: sin rol activo en el negocio -> SALE_NOT_FOUND.
//  2) Rol: solo fiscal_reconciler (hasRole). Un cajero (fiscal_operator) o un dueño sin ese rol
//     recibe RECONCILIATION_NOT_AUTHORIZED. El dueño NO reconcilia por ser dueño.
//  3) Identidad: evidence.reviewerUserId debe ser el usuario autenticado. Nadie firma por otro.
//  4) Auditoría obligatoria ANTES de actuar: si no se puede escribir, no hay reconciliación (falla cerrado).
//  5) Auditoría del resultado (applied / rejected). Si falla tras aplicar, se devuelve error interno
//     para que la incidencia sea visible; la evidencia ya quedó en el registro solo-anexar.
export function createAdminReconciler({ store }) {
  if (!store) throw new Error('store is required');
  const core = createReconciler({ store, authorize: async () => true }); // la autorización ya se hizo arriba

  async function reconcile({ actorUserId, saleId, evidence }) {
    if (!saleId || !actorUserId) throw new FiscalError('SALE_NOT_FOUND');
    const sale = await store.loadSaleById(saleId);
    if (!sale) throw new FiscalError('SALE_NOT_FOUND');
    const member = await store.loadActorRole(sale.businessId, actorUserId);
    if (!member) throw new FiscalError('SALE_NOT_FOUND');

    const base = { businessId: sale.businessId, saleId: sale.id, actorUserId, action: 'reconcile_attempt' };
    const summary = { outcome: evidence?.outcome ?? null, evidenceReference: evidence?.evidenceReference ?? null };

    const isReconciler = await store.hasRole(sale.businessId, actorUserId, RECONCILER_ROLE);
    if (!isReconciler) {
      await store.appendAudit({ ...base, outcome: 'denied_no_reconciler_role', detail: { ...summary, memberRole: member } });
      throw new FiscalError('RECONCILIATION_NOT_AUTHORIZED');
    }

    if (typeof evidence?.reviewerUserId !== 'string' || evidence.reviewerUserId !== actorUserId) {
      await store.appendAudit({ ...base, outcome: 'denied_reviewer_mismatch', detail: summary });
      throw new FiscalError('EVIDENCE_REVIEWER_MISMATCH');
    }

    // Auditar antes de actuar. Si esto falla, la excepción sale y no se reconcilia.
    await store.appendAudit({ ...base, outcome: 'started', detail: summary });

    let result;
    try {
      result = await core.reconcile({ actorUserId, saleId, evidence });
    } catch (err) {
      await store.appendAudit({
        businessId: sale.businessId, saleId: sale.id, actorUserId,
        action: 'reconcile_result', outcome: 'rejected', detail: { ...summary, code: err?.code ?? 'ERROR' },
      }).catch(() => {});
      throw err;
    }

    try {
      await store.appendAudit({
        businessId: sale.businessId, saleId: sale.id, actorUserId,
        action: 'reconcile_result', outcome: 'applied', detail: { ...summary, status: result.status, folio: result.folio },
      });
    } catch {
      throw new Error('reconciled but audit result could not be stored'); // error interno visible (500)
    }
    return result;
  }

  return Object.freeze({ reconcile });
}
