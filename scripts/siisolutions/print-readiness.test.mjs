import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFiscalPrintDecision } from '../../api/_lib/siisolutions-print-readiness.js';

const issued = { status: 'issued', folio: 1042, xml_base64: 'eG1s', pdf_base64: 'cGRm' };

test('only an issued fiscal document with provider PDF and XML can print', () => {
  const result = getFiscalPrintDecision(issued);
  assert.equal(result.printable, true);
  assert.equal(result.folio, 1042);
  assert.equal(result.pdfBase64, 'cGRm');
});

test('pending, unknown and failed fiscal outcomes never print', () => {
  for (const status of ['pending', 'sending', 'unknown', 'failed', 'cancelled']) {
    assert.equal(getFiscalPrintDecision({ ...issued, status }).printable, false);
  }
});

test('folio, XML and PDF are all mandatory', () => {
  assert.equal(getFiscalPrintDecision({ ...issued, folio: null }).reason, 'FOLIO_MISSING');
  assert.equal(getFiscalPrintDecision({ ...issued, xml_base64: '' }).reason, 'XML_MISSING');
  assert.equal(getFiscalPrintDecision({ ...issued, pdf_base64: null }).reason, 'PDF_MISSING');
});
