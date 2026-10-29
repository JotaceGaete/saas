import { createManualFiscalReconciler } from './siisolutions-reconciliation-service.js';
import { createFiscalOriginalDocumentLoader } from './siisolutions-original-document-loader.js';

/**
 * No public endpoint. Trusted backend operator must supply a read-only
 * provider retrieval and independent authenticity verifier. Both are mandatory.
 * No emission API or automatic retry is called.
 */
export function createConfiguredFiscalReconciliation({
  admin, retrieveOriginal, verifyOriginal,
}) {
  const { loadOriginalDocument, verifyOriginalDocument } =
    createFiscalOriginalDocumentLoader({ retrieveOriginal, verifyOriginal });
  return createManualFiscalReconciler({
    admin, loadOriginalDocument, verifyOriginalDocument,
  });
}
