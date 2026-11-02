// Validación previa, sin impresión ni emisión fiscal. No sustituye un parser PDF.
export const MAX_FISCAL_PDF_BYTES = 2 * 1024 * 1024;
export const PDF_HEADER = '%PDF-';

export class FiscalPdfPreflightError extends Error {
  constructor(code) {
    super(code);
    this.name = 'FiscalPdfPreflightError';
    this.code = code;
  }
}

/**
 * Verifica que los bytes recibidos sean plausiblemente un PDF.
 * La validación estructural completa, el límite de páginas y el render
 * deben hacerse con un parser PDF seguro antes de enviarlo a imprimir.
 * @param {Uint8Array | ArrayBuffer} input
 * @returns {Uint8Array}
 */
export function preflightFiscalPdf(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : input;
  if (!(bytes instanceof Uint8Array)) throw new FiscalPdfPreflightError('PDF_INVALID_INPUT');
  if (bytes.byteLength < 16) throw new FiscalPdfPreflightError('PDF_TOO_SHORT');
  if (bytes.byteLength > MAX_FISCAL_PDF_BYTES) throw new FiscalPdfPreflightError('PDF_TOO_LARGE');
  const header = String.fromCharCode(...bytes.subarray(0, 5));
  if (header !== PDF_HEADER) throw new FiscalPdfPreflightError('PDF_INVALID_HEADER');
  // Comprobación superficial: no aceptar un archivo cortado sin marcador final.
  const tail = new TextDecoder('latin1').decode(bytes.subarray(Math.max(0, bytes.length - 2048)));
  if (!/%%EOF\s*$/.test(tail)) throw new FiscalPdfPreflightError('PDF_MISSING_EOF');
  return bytes;
}
