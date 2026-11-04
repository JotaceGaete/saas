// Preparación de la reimpresión desde el PDF guardado (F2 §print). NO envía nada a impresora.
// Walinka Print Connector no se modifica: solo acepta ESC/POS raster (GS v 0). Convertir el PDF
// a raster y validar legibilidad del PDF417 en XP-80C son decisiones/pruebas pendientes.

import { FiscalError } from './errors.mjs';

export const MAX_PDF_BYTES = 2 * 1024 * 1024;

export function planStoredPdfPrint({ folio, pdfBase64 }) {
  if (!Number.isSafeInteger(folio) || folio <= 0) throw new FiscalError('PRINT_PLAN_INVALID', 'folio required');
  if (typeof pdfBase64 !== 'string' || pdfBase64.trim() === '') {
    throw new FiscalError('PRINT_PLAN_INVALID', 'stored PDF missing');
  }
  const bytes = Buffer.from(pdfBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PDF_BYTES) {
    throw new FiscalError('PRINT_PLAN_INVALID', 'stored PDF size out of range');
  }
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new FiscalError('PRINT_PLAN_INVALID', 'stored document is not a PDF');
  }
  return {
    folio,
    pdfBytes: bytes.length,
    transport: 'print-connector',
    connectorModified: false,
    requires: ['rasterize-pdf-to-gs-v-0', 'xp80c-pdf417-legibility-test'],
    sent: false,
  };
}
