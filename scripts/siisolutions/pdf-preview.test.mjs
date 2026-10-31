import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeFiscalPdfForPreview } from '../../api/_lib/siisolutions-pdf-preview.js';

const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF').toString('base64');

test('valid issued provider PDF is available for offline preview', () => {
  const result = decodeFiscalPdfForPreview({ status: 'issued', folio: 1042, pdfBase64: pdf });
  assert.equal(result.ready, true);
  assert.equal(result.mimeType, 'application/pdf');
  assert.equal(result.bytes.subarray(0, 5).toString(), '%PDF-');
});

test('preview rejects pending documents and missing folio', () => {
  assert.equal(decodeFiscalPdfForPreview({ status: 'unknown', folio: 1042, pdfBase64: pdf }).reason, 'NOT_ISSUED');
  assert.equal(decodeFiscalPdfForPreview({ status: 'issued', folio: 0, pdfBase64: pdf }).reason, 'INVALID_FOLIO');
});

test('preview rejects arbitrary text disguised as PDF', () => {
  const fake = Buffer.from('not a PDF').toString('base64');
  assert.equal(decodeFiscalPdfForPreview({ status: 'issued', folio: 1042, pdfBase64: fake }).reason, 'NOT_A_PDF');
  assert.equal(decodeFiscalPdfForPreview({ status: 'issued', folio: 1042, pdfBase64: '@@@' }).reason, 'INVALID_PDF_BASE64');
});
