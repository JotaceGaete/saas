// Almacén del emisor sobre supabase-js (cliente con service_role). Es el que usa index.ts
// en Supabase Edge Functions. Lee y escribe solo mediante RPC de esquema public (PostgREST solo
// expone public) y SELECT puntuales sobre tablas de public.
//
// Cualquier cliente que se pase aquí debe ser de service_role. Nunca un cliente de usuario.
//
// ESTADO DE VERIFICACIÓN: el comportamiento frente a errores reales de PostgREST está cubierto
// por pruebas con respuestas en forma PostgREST (test/unit/store-supabase.test.mjs). NO está
// verificado contra un servidor PostgREST real; ese paso sigue pendiente.

import { mapCredentialRecord, mapEmissionContext, mapIssuance, mapPostgrestError, mapActorRole, mapStaleList, StoreError } from './store-common.mjs';

export function createSupabaseStore(client) {
  if (!client || typeof client.rpc !== 'function' || typeof client.from !== 'function') {
    throw new Error('createSupabaseStore needs a supabase-js client');
  }

  // supabase-js devuelve { data, error } para errores de PostgREST. Una excepción lanzada
  // (fallo de red antes de recibir respuesta) se convierte en StoreError sin detalles.
  async function call(run) {
    let res;
    try {
      res = await run();
    } catch {
      throw new StoreError('STORE_UNAVAILABLE');
    }
    if (res?.error) throw mapPostgrestError(res.error);
    return res?.data ?? null;
  }

  const rpc = (fn, args) => call(() => client.rpc(fn, args));

  async function select(table, columns, column, value) {
    return call(() => client.from(table).select(columns).eq(column, value).maybeSingle());
  }

  return {
    async loadSaleById(saleId) {
      const r = await select('crm_invoices', 'id, business_id, status, paid_at, total, discount_amount', 'id', saleId);
      return r && {
        id: r.id,
        businessId: r.business_id,
        status: r.status,
        paidAt: r.paid_at,
        total: Number(r.total),
        discountAmount: Number(r.discount_amount ?? 0),
      };
    },

    async loadBusiness(businessId) {
      const r = await select('wa_businesses', 'id, user_id, country_code', 'id', businessId);
      return r && { id: r.id, userId: r.user_id, countryCode: r.country_code };
    },

    async loadActorRole(businessId, userId) {
      return mapActorRole(await rpc('crm_fiscal_actor_role', { p_business_id: businessId, p_user_id: userId }));
    },

    async getIssuance(businessId, saleId) {
      return mapIssuance(await rpc('crm_fiscal_get_issuance', { p_business_id: businessId, p_sale_id: saleId }));
    },

    async loadEmissionContext(businessId, saleId) {
      return mapEmissionContext(await rpc('crm_fiscal_emission_context', { p_business_id: businessId, p_sale_id: saleId }));
    },

    async loadCredentialRecord(businessId) {
      return mapCredentialRecord(await rpc('crm_fiscal_get_credentials', { p_business_id: businessId }));
    },

    async claim(businessId, saleId, operationId) {
      return Boolean(await rpc('crm_claim_fiscal_issuance', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId, p_dte_type: 39,
      }));
    },

    async claimWithCredentials(businessId, saleId, operationId) {
      const raw = await rpc('crm_fiscal_claim_with_credentials', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId,
      });
      return {
        claimed: raw?.claimed === true,
        credentials: raw?.claimed === true ? mapCredentialRecord(raw.credentials) : null,
      };
    },

    async releaseClaim(businessId, saleId, operationId) {
      return Boolean(await rpc('crm_fiscal_release_claim', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId,
      }));
    },

    async storeReceipt(businessId, saleId, operationId, doc) {
      return Boolean(await rpc('crm_fiscal_store_receipt', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_folio: doc.folio,
        p_xml_base64: doc.xmlBase64,
        p_pdf_base64: doc.pdfBase64,
      }));
    },

    async finalize(businessId, saleId, operationId, out) {
      return Boolean(await rpc('crm_finalize_fiscal_issuance', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_status: out.status,
        p_folio: out.folio ?? null,
        p_xml_base64: out.xmlBase64 ?? null,
        p_pdf_base64: out.pdfBase64 ?? null,
        // Solo con la migración E (20261102_fiscal_sii_status.sql). Se omite si no hay motivo.
        ...(out.errorCode ? { p_error_code: out.errorCode } : {}),
      }));
    },

    async markFailed(businessId, saleId, operationId, errorCode) {
      return Boolean(await rpc('crm_fiscal_mark_failed', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId, p_error_code: errorCode,
      }));
    },

    async hasRole(businessId, userId, role) {
      return Boolean(await rpc('crm_fiscal_has_role', { p_business_id: businessId, p_user_id: userId, p_role: role }));
    },

    async appendAudit(entry) {
      return Boolean(await rpc('crm_fiscal_audit_append', {
        p_business_id: entry.businessId,
        p_sale_id: entry.saleId ?? null,
        p_actor_user_id: entry.actorUserId ?? null,
        p_action: entry.action,
        p_outcome: entry.outcome,
        p_detail: entry.detail ?? {},
      }));
    },

    async listStaleSending(before) {
      return mapStaleList(await rpc('crm_fiscal_list_stale_sending', { p_before: before.toISOString() }));
    },

    async finalizeFromReceipt(businessId, saleId, operationId) {
      return Boolean(await rpc('crm_fiscal_finalize_from_receipt', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId,
      }));
    },

    async markStaleUnknown(businessId, saleId, operationId, before) {
      return Boolean(await rpc('crm_fiscal_mark_stale_unknown', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_before: before.toISOString(),
      }));
    },

    async reconcileWithEvidence(businessId, saleId, operationId, ev) {
      return Boolean(await rpc('crm_fiscal_reconcile_with_evidence', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_outcome: ev.outcome,
        p_folio: ev.folio ?? null,
        p_xml_base64: ev.xmlBase64 ?? null,
        p_pdf_base64: ev.pdfBase64 ?? null,
        p_reviewer: ev.reviewer,
        p_reason: ev.reason,
        p_evidence_reference: ev.evidenceReference,
        p_provider_status: ev.providerStatus,
        p_checked_at: ev.checkedAt,
      }));
    },

    // Reconciliación administrativa atómica (ver crm_fiscal_reconcile_admin en la migración).
    async reconcileAdmin(businessId, saleId, operationId, actorUserId, ev) {
      return Boolean(await rpc('crm_fiscal_reconcile_admin', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_actor_user_id: actorUserId,
        p_reviewer_user_id: ev.reviewerUserId,
        p_outcome: ev.outcome,
        p_folio: ev.folio ?? null,
        p_xml_base64: ev.xmlBase64 ?? null,
        p_pdf_base64: ev.pdfBase64 ?? null,
        p_reviewer: ev.reviewer,
        p_reason: ev.reason,
        p_evidence_reference: ev.evidenceReference,
        p_provider_status: ev.providerStatus,
        p_checked_at: ev.checkedAt,
      }));
    },
  };
}
