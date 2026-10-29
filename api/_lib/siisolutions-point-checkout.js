import { verifyPointOrderForFiscal } from './siisolutions-point-proof.js';
import { normalizeCrmFiscalSale } from './siisolutions-crm-bridge.js';
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
  const records = await loadPersisted({ invoiceId, businessId });
  const { invoice, items, payments, operation } = records || {};
  if (!invoice || invoice.id !== invoiceId ||
      invoice.business_id !== businessId ||
      !operation || operation.business_id !== businessId ||
      operation.crm_invoice_id !== invoiceId) {
    return { state: 'blocked', reason: 'PERSISTED_SALE_MISMATCH' };
  }
  if (!operation.mp_order_id) {
    return { state: 'blocked', reason: 'POINT_ORDER_MISSING' };
  }
  const providerOrder = await fetchProviderOrder({
    businessId, orderId: operation.mp_order_id,
  });
  const verified = verifyPointOrderForFiscal({
    invoice, operation, providerOrder,
  });
  if (!verified.verified) {
    return { state: 'blocked', reason: verified.reason };
  }
  const normalized = normalizeCrmFiscalSale({
    invoice, items, payments, verifiedPointPayment: verified.proof,
  });
  if (!normalized.ready) {
    return { state: 'blocked', reason: normalized.reason };
  }
  return issueCheckoutBoleta({
    sale: normalized.sale, payment: normalized.payment,
    businessId, issuerBusinessId, operatorRut, apiKey,
    repository, sandboxBaseUrl, fetchImpl,
  });
}
