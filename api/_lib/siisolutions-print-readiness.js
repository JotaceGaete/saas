/**
 * Safe receipt-print decision. Never print a fiscal ticket from a POS draft
 * or from an unconfirmed/ambiguous fiscal emission.
 * PDF bytes come from the provider, not from a locally rendered receipt.
 */
export function getFiscalPrintDecision(issuance) {
  if (!issuance || issuance.status !== 'issued') {
    return { printable: false, reason: 'FISCAL_NOT_ISSUED' };
  }
  if (!Number.isSafeInteger(Number(issuance.folio)) || Number(issuance.folio) <= 0) {
    return { printable: false, reason: 'FOLIO_MISSING' };
  }
  if (typeof issuance.xml_base64 !== 'string' || !issuance.xml_base64.trim()) {
    return { printable: false, reason: 'XML_MISSING' };
  }
  if (typeof issuance.pdf_base64 !== 'string' || !issuance.pdf_base64.trim()) {
    return { printable: false, reason: 'PDF_MISSING' };
  }
  // No client-generated stamp, QR, folio, or tax document.
  return {
    printable: true,
    reason: null,
    folio: Number(issuance.folio),
    pdfBase64: issuance.pdf_base64,
  };
}
