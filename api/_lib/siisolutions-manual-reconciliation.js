/**
 * Validate a manually retrieved DTE 39 before resolving an unknown issuance.
 * This is a pure gate: it never fetches from the provider or sends a new DTE.
 * The trusted reconciliation operator must independently retrieve and verify
 * the original XML/PDF and its sale/business/operation association.
 */
export function validateManualFiscalReconciliation({
  ledger, businessId, saleId, operationId, document,
}) {
  if (!ledger || ledger.status !== 'unknown' ||
      ledger.business_id !== businessId || ledger.sale_id !== saleId ||
      ledger.operation_id !== operationId || ledger.dte_type !== 39 ||
      ledger.provider !== 'siisolutions') {
    return { ready: false, reason: 'UNKNOWN_LEDGER_MISMATCH' };
  }
  if (!document || document.businessId !== businessId ||
      document.saleId !== saleId || document.operationId !== operationId ||
      document.dteType !== 39 || document.provider !== 'siisolutions' ||
      document.verifiedByTrustedOperator !== true) {
    return { ready: false, reason: 'DOCUMENT_IDENTITY_NOT_VERIFIED' };
  }
  if (!Number.isSafeInteger(document.folio) || document.folio <= 0 ||
      typeof document.xmlBase64 !== 'string' || !document.xmlBase64.trim() ||
      typeof document.pdfBase64 !== 'string' || !document.pdfBase64.trim()) {
    return { ready: false, reason: 'INCOMPLETE_ORIGINAL_DOCUMENT' };
  }
  return {
    ready: true,
    folio: document.folio,
    xmlBase64: document.xmlBase64,
    pdfBase64: document.pdfBase64,
  };
}
