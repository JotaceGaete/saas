import { verifyPointSaleForFiscal } from './siisolutions-point-verification.js';
import { issueCheckoutBoleta } from './siisolutions-checkout-issuer.js';

/**
 * Server-only Point-to-fiscal handoff.
 * loadPersisted must fetch invoice, items, payments and the Point operation
 * using a privileged backend; fetchProviderOrder must use the connected
 * business' Mercado Pago credentials, not request-supplied credentials.
 * Neither dependency may trust client-supplied payment evidence.
 */
export async function issueVerifiedPointBoleta({
  invoiceId, businessId, loadPersisted, fetchProviderOrder,
  issuerBusinessId, operatorRut, apiKey, repository, sandboxBaseUrl,
  fetchImpl,
}) {
  if (!invoiceId || !businessId ||
      typeof loadPersisted !== 'function' ||
      typeof fetchProviderOrder !== 'function') {
    return { state: 'blocked', reason: 'TRUSTED_DEPENDENCIES_REQUIRED' };
  }
  const verdict = await verifyPointSaleForFiscal({
    invoiceId, businessId, loadPersisted, fetchProviderOrder,
  });
  if (!verdict.ready) return { state: 'blocked', reason: verdict.reason };
  return issueCheckoutBoleta({
    sale: verdict.sale, payment: verdict.payment,
    businessId, issuerBusinessId, operatorRut, apiKey,
    repository, sandboxBaseUrl, fetchImpl,
  });
}
