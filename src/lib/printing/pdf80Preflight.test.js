import { describe, it, expect } from 'vitest';
import { preflightFiscalPdf, FiscalPdfPreflightError, MAX_FISCAL_PDF_BYTES } from './pdf80Preflight';

const bytes = (text) => new TextEncoder().encode(text);
const valid = () => bytes('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

describe('PDF 80 mm preflight (sin emisión ni impresión)', () => {
  it('acepta encabezado y EOF plausibles', () => {
    expect(preflightFiscalPdf(valid())).toEqual(valid());
  });
  it('acepta ArrayBuffer', () => {
    const input = valid();
    expect(preflightFiscalPdf(input.buffer)).toEqual(input);
  });
  it('rechaza ESC/POS y otros formatos', () => {
    expect(() => preflightFiscalPdf(bytes('\x1b@ticket de venta'))).toThrow(FiscalPdfPreflightError);
    expect(() => preflightFiscalPdf(bytes('NOT A PDF AND NOT A VALID DOCUMENT'))).toThrow('PDF_INVALID_HEADER');
  });
  it('rechaza truncamiento', () => {
    expect(() => preflightFiscalPdf(bytes('%PDF-1.4\ntrailer without end marker'))).toThrow('PDF_MISSING_EOF');
  });
  it('rechaza archivo demasiado grande', () => {
    const input = new Uint8Array(MAX_FISCAL_PDF_BYTES + 1);
    expect(() => preflightFiscalPdf(input)).toThrow('PDF_TOO_LARGE');
  });
  it('rechaza datos ausentes', () => {
    expect(() => preflightFiscalPdf(null)).toThrow('PDF_INVALID_INPUT');
  });
});
