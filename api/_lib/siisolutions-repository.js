// Server-only Supabase repository. Pass a service-role client created in a
// trusted backend; never import this file into the browser.
export function createFiscalIssuanceRepository(supabaseAdmin) {
  if (!supabaseAdmin?.rpc) throw new Error('Trusted Supabase client required');
  return {
    async claimPending({ businessId, saleId, operationId, dteType }) {
      const { data, error } = await supabaseAdmin.rpc('crm_claim_fiscal_issuance', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_dte_type: dteType,
      });
      if (error) throw new Error('Unable to claim fiscal issuance');
      return data === true;
    },
    async registerPending({ businessId, saleId, operationId, dteType }) {
      const { data, error } = await supabaseAdmin.rpc('crm_fiscal_register_pending', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_dte_type: dteType,
      });
      if (error) throw new Error('Unable to register pending fiscal issuance');
      return data === true;
    },
    async finalize({ businessId, saleId, operationId, state, folio, xmlBase64, pdfBase64 }) {
      const { data, error } = await supabaseAdmin.rpc('crm_finalize_fiscal_issuance', {
        p_business_id: businessId,
        p_sale_id: saleId,
        p_operation_id: operationId,
        p_status: state,
        p_folio: folio ?? null,
        p_xml_base64: xmlBase64 ?? null,
        p_pdf_base64: pdfBase64 ?? null,
      });
      if (error || data !== true) throw new Error('Unable to finalize fiscal issuance; reconcile manually before retry');
      return true;
    },
  };
}
