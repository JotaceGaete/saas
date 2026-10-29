import { createDteCoreDocumentTransport } from './siisolutions-dtecore-transport.js';
import { createConfiguredFiscalReconciliation } from './siisolutions-reconciliation-pilot.js';

/**
 * Wires documented read-only DTECore GET endpoints into manual reconciliation.
 *
 * The actual XML/PDF response envelopes are not yet verified. An explicit
 * server-side decoder and independent authenticity verifier are required.
 * A trusted operator supplies the folio from a verified 409/ledger lookup.
 * This function never issues, retries or trusts a browser-supplied folio.
 */
function isPlausibleBase64(value) {
  if (typeof value !== 'string' || value.length < 4 || value.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  return true;
}

export function createDteCoreFiscalReconciliation({
  admin, apiKey, resolveExistingFolio, decodeOriginalDocuments,
  verifyOriginal, fetchImpl, env = process.env,
}) {
  if (typeof resolveExistingFolio !== 'function' ||
      typeof decodeOriginalDocuments !== 'function' ||
      typeof verifyOriginal !== 'function') {
    throw new Error('Trusted folio resolver, document decoder and verifier required');
  }
  const transport = createDteCoreDocumentTransport({ apiKey, fetchImpl });
  return createConfiguredFiscalReconciliation({
    admin, env,
    async retrieveOriginal({ businessId, saleId, operationId }) {
      const folio = await resolveExistingFolio({ businessId, saleId, operationId });
      if (!Number.isSafeInteger(folio) || folio <= 0) return null;
      const xml = await transport.getXml(folio);
      if (!xml.ok) return null;
      const pdf = await transport.getPdf(folio);
      if (!pdf.ok) return null;
      const decoded = await decodeOriginalDocuments({ xml: xml.body, pdf: pdf.body, folio });
      if (!decoded || decoded.folio !== folio ||
          !isPlausibleBase64(decoded.xmlBase64) ||
          !isPlausibleBase64(decoded.pdfBase64)) return null;
      return {
        source: 'authenticated-provider-read',
        businessId, saleId, operationId, provider: 'siisolutions',
        dteType: 39, folio, xmlBase64: decoded.xmlBase64,
        pdfBase64: decoded.pdfBase64,
      };
    },
    verifyOriginal,
  });
}
