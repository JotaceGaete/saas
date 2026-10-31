import { verifyPointOrderForFiscal } from './siisolutions-point-proof.js';
import { normalizeCrmFiscalSale } from './siisolutions-crm-bridge.js';

/**
 * Read-only verification of a persisted Point sale for fiscal purposes.
 * Performs NO emission and NO ledger writes. Communication failures (thrown
 * by loadPersisted or fetchProviderOrder) propagate to the caller, which must
 * treat them as "verification unavailable", never as "not eligible".
 */
export async function verifyPointSaleForFiscal({
  invoiceId, businessId, loadPersisted, fetchProviderOrder,
}) {
  if (!invoiceId || !businessId ||
      typeof loadPersisted !== 'function' ||
      typeof fetchProviderOrder !== 'function') {
    return { ready: false, reason: 'TRUSTED_DEPENDENCIES_REQUIRED' };
  }
  const records = await loadPersisted({ invoiceId, businessId });
  const { invoice, items, payments, operation } = records || {};
  if (!invoice || invoice.id !== invoiceId ||
      invoice.business_id !== businessId ||
      !operation || operation.business_id !== businessId ||
      operation.crm_invoice_id !== invoiceId) {
    return { ready: false, reason: 'PERSISTED_SALE_MISMATCH' };
  }
  if (!operation.mp_order_id) {
    return { ready: false, reason: 'POINT_ORDER_MISSING' };
  }
  const providerOrder = await fetchProviderOrder({
    businessId, orderId: operation.mp_order_id,
  });
  const verified = verifyPointOrderForFiscal({ invoice, operation, providerOrder });
  if (!verified.verified) return { ready: false, reason: verified.reason };
  const normalized = normalizeCrmFiscalSale({
    invoice, items, payments, verifiedPointPayment: verified.proof,
  });
  if (!normalized.ready) return { ready: false, reason: normalized.reason };
  return { ready: true, reason: null, sale: normalized.sale, payment: normalized.payment };
}
