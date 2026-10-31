/**
 * Prepare an issued 80mm provider PDF for a local preview without QZ Tray.
 * Returns raw bytes; the browser may create a temporary Blob URL for viewing.
 * This module never contacts a printer, tax provider, or payment processor.
 */
export function decodeFiscalPdfForPreview({ status, folio, pdfBase64 }) {
  if (status !== 'issued') return { ready: false, reason: 'NOT_ISSUED' };
  if (!Number.isSafeInteger(folio) || folio <= 0) return { ready: false, reason: 'INVALID_FOLIO' };
  if (typeof pdfBase64 !== 'string' || !pdfBase64.length ||
      pdfBase64.length > 12_000_000 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(pdfBase64)) {
    return { ready: false, reason: 'INVALID_PDF_BASE64' };
  }
  const binary = Buffer.from(pdfBase64, 'base64');
  if (binary.length < 8 || binary.subarray(0, 5).toString('ascii') !== '%PDF-') {
    return { ready: false, reason: 'NOT_A_PDF' };
  }
  return { ready: true, mimeType: 'application/pdf', bytes: binary, folio };
}
