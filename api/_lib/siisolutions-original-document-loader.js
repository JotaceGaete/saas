/**
 * Trusted retrieval adapter for manual DTE 39 reconciliation.
 *
 * The provider's actual retrieval API contract has NOT been verified.
 * A deployment must supply a server-only retrieveOriginal function backed by
 * an authenticated, documented read-only endpoint. This module does not guess
 * URLs or reuse the emission endpoint. It never emits a document.
 */
export function createFiscalOriginalDocumentLoader({ retrieveOriginal, verifyOriginal }) {
  if (typeof retrieveOriginal !== 'function' || typeof verifyOriginal !== 'function') {
    throw new Error('Verified read-only provider retrieval and verifier required');
  }

  return {
    async loadOriginalDocument({ businessId, saleId, operationId }) {
      if (!businessId || !saleId || !operationId) return null;
      const result = await retrieveOriginal({ businessId, saleId, operationId });
      if (!result || result.source !== 'authenticated-provider-read' ||
          result.businessId !== businessId || result.saleId !== saleId ||
          result.operationId !== operationId || result.dteType !== 39 ||
          result.provider !== 'siisolutions') return null;
      return {
        businessId, saleId, operationId, dteType: 39, provider: 'siisolutions',
        folio: result.folio, xmlBase64: result.xmlBase64, pdfBase64: result.pdfBase64,
      };
    },

    async verifyOriginalDocument({ businessId, saleId, operationId, document }) {
      if (!document || document.businessId !== businessId ||
          document.saleId !== saleId || document.operationId !== operationId) return false;
      // Must independently verify authenticity, issuer RUT, document type,
      // folio, total and source provenance; never trust a client flag.
      return (await verifyOriginal({ businessId, saleId, operationId, document })) === true;
    },
  };
}
