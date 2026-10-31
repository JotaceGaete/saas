// Almacén del emisor sobre supabase-js (cliente con service_role). Es el que usa index.ts
// en Supabase Edge Functions. Lee y escribe solo mediante las RPC del ledger (ver migración
// propuesta, sección 3d) y SELECT puntuales sobre tablas de public.
//
// Cualquier cliente que se pase aquí debe ser de service_role. Nunca un cliente de usuario.

import { mapCredentialRecord, mapEmissionContext, mapIssuance, mapRpcError } from './store-common.mjs';

export function createSupabaseStore(client) {
  if (!client || typeof client.rpc !== 'function' || typeof client.from !== 'function') {
    throw new Error('createSupabaseStore needs a supabase-js client');
  }

  async function rpc(fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw mapRpcError(new Error(error.message));
    return data;
  }

  async function select(table, columns, column, value) {
    const { data, error } = await client.from(table).select(columns).eq(column, value).maybeSingle();
    if (error) throw mapRpcError(new Error(error.message));
    return data;
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

    async finalize(businessId, saleId, operationId, out) {
      return Boolean(await rpc('crm_finalize_fiscal_issuance', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_status: out.status,
        p_folio: out.folio ?? null,
        p_xml_base64: out.xmlBase64 ?? null,
        p_pdf_base64: out.pdfBase64 ?? null,
      }));
    },

    async markFailed(businessId, saleId, operationId, errorCode) {
      return Boolean(await rpc('crm_fiscal_mark_failed', {
        p_business_id: businessId, p_sale_id: saleId, p_operation_id: operationId, p_error_code: errorCode,
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
  };
}
