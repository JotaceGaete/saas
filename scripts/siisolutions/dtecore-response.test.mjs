import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDteCoreIssuanceResponse } from '../../api/_lib/siisolutions-dtecore-response.js';

test('normalizes actual successful live response without requiring inline XML/PDF', () => {
  const result = normalizeDteCoreIssuanceResponse({
    folio: 51105, esSimulacion: false, xmlBase64: null, pdfBase64: null,
    pdfEstado: 'no_solicitado',
    documentos: {
      pdf: 'https://api.siisolutions.cl/dte/documentos/39/51105/pdf',
      xml: 'https://api.siisolutions.cl/dte/documentos/39/51105/xml',
    },
  }, { expectedSimulation: false });
  assert.equal(result.folio, 51105);
  assert.equal(result.siiStatus, 'unverified');
  assert.equal(result.needsReconciliation, true);
  assert.equal(result.hasInlineXml, false);
  assert.equal(result.pdfStatus, 'no_solicitado');
});
test('rejects mismatched simulation environment', () => {
  assert.throws(() => normalizeDteCoreIssuanceResponse(
    { folio: 51105, esSimulacion: false }, { expectedSimulation: true }
  ), /environment mismatch/);
});
test('rejects missing folio or simulation flag', () => {
  assert.throws(() => normalizeDteCoreIssuanceResponse({ esSimulacion: false }), /folio/);
  assert.throws(() => normalizeDteCoreIssuanceResponse({ folio: 1 }), /simulation flag/);
});
test('does not trust unapproved document URL', () => {
  const result = normalizeDteCoreIssuanceResponse({
    folio: 1, esSimulacion: false,
    documentos: { xml: 'https://attacker.example/dte/documentos/39/1/xml' },
  });
  assert.equal(result.xmlUrl, null);
});
