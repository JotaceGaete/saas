import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planStoredPdfPrint, MAX_PDF_BYTES } from '../../lib/print-plan.mjs';

const PDF = Buffer.from('%PDF-1.4\n%test\n').toString('base64');

test('plan desde PDF guardado: no envía nada y no modifica el conector', () => {
  const p = planStoredPdfPrint({ folio: 51106, pdfBase64: PDF });
  assert.equal(p.sent, false);
  assert.equal(p.connectorModified, false);
  assert.equal(p.folio, 51106);
  assert.ok(p.requires.includes('rasterize-pdf-to-gs-v-0'));
});

test('rechaza documento que no es PDF, vacío, o sin folio', () => {
  assert.throws(() => planStoredPdfPrint({ folio: 1, pdfBase64: Buffer.from('<html>').toString('base64') }), { code: 'PRINT_PLAN_INVALID' });
  assert.throws(() => planStoredPdfPrint({ folio: 1, pdfBase64: '' }), { code: 'PRINT_PLAN_INVALID' });
  assert.throws(() => planStoredPdfPrint({ folio: 0, pdfBase64: PDF }), { code: 'PRINT_PLAN_INVALID' });
  assert.throws(() => planStoredPdfPrint({ folio: null, pdfBase64: PDF }), { code: 'PRINT_PLAN_INVALID' });
});

test('rechaza PDF por encima del límite de tamaño', () => {
  const big = Buffer.alloc(MAX_PDF_BYTES + 1, 0x41);
  big.write('%PDF-', 0, 'latin1');
  assert.throws(() => planStoredPdfPrint({ folio: 1, pdfBase64: big.toString('base64') }), { code: 'PRINT_PLAN_INVALID' });
});
