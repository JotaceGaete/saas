import { validateManualFiscalReconciliation } from './siisolutions-manual-reconciliation.js';

/**
 * Privileged manual reconciliation. The caller MUST authenticate the operator,
 * independently retrieve the original DTE from a trusted provider source and
 * verify its identity and authenticity using an independent trusted verifier.
 * No browser endpoint is provided. Never calls emission APIs.
 */
export function createManualFiscalReconciler({ admin, loadOriginalDocument, verifyOriginalDocument }) {
  if (!admin?.from || !admin?.rpc || typeof loadOriginalDocument !== 'function' ||
      typeof verifyOriginalDocument !== 'function') {
    throw new Error('Trusted fiscal reconciliation dependencies required');
  }
  return async function reconcile({ businessId, saleId, operationId }) {
    if (!businessId || !saleId || !operationId) {
      return { state: 'blocked', reason: 'IDENTITY_REQUIRED' };
    }
    const { data: ledger, error } = await admin.from('crm_fiscal_issuances')
      .select('business_id,sale_id,operation_id,status,dte_type,provider')
      .eq('business_id', businessId).eq('sale_id', saleId)
      .eq('operation_id', operationId).maybeSingle();
    if (error) throw new Error('Unable to load fiscal ledger');
    if (!ledger || ledger.status !== 'unknown') {
      return { state: 'blocked', reason: 'UNKNOWN_LEDGER_REQUIRED' };
    }

    // Never accept original document bytes, folio or verification flags from
    // request parameters; only a trusted backend loader may provide them.
    const document = await loadOriginalDocument({ businessId, saleId, operationId });
    const authentic = await verifyOriginalDocument({
      businessId, saleId, operationId, document,
    });
    if (authentic !== true) return { state: 'blocked', reason: 'ORIGINAL_AUTHENTICITY_NOT_VERIFIED' };
    const checked = validateManualFiscalReconciliation({
      ledger, businessId, saleId, operationId,
      document: { ...document, verifiedByTrustedOperator: true },
    });
    if (!checked.ready) return { state: 'blocked', reason: checked.reason };

    const { data, error: rpcError } = await admin.rpc('crm_reconcile_fiscal_issuance', {
      p_business_id: businessId,
      p_sale_id: saleId,
      p_operation_id: operationId,
      p_folio: checked.folio,
      p_xml_base64: checked.xmlBase64,
      p_pdf_base64: checked.pdfBase64,
    });
    if (rpcError) throw new Error('Unable to reconcile fiscal issuance');
    return data === true
      ? { state: 'issued', folio: checked.folio }
      : { state: 'blocked', reason: 'ALREADY_RECONCILED_OR_STATE_CHANGED' };
  };
}
