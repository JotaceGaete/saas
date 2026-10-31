/**
 * Validate a freshly fetched Mercado Pago Point order against a persisted
 * Point operation and its finalized CRM invoice.
 *
 * Call ONLY on a trusted server. Never accept either input from the browser.
 * A processed order alone is insufficient: the payment must be approved.
 */
export function verifyPointOrderForFiscal({ invoice, operation, providerOrder }) {
  if (!invoice?.id || !invoice.business_id || !operation || !providerOrder) {
    return { verified: false, reason: 'MISSING_EVIDENCE' };
  }
  if (operation.business_id !== invoice.business_id ||
      operation.crm_invoice_id !== invoice.id ||
      !operation.mp_order_id ||
      !operation.mp_payment_id) {
    return { verified: false, reason: 'OPERATION_MISMATCH' };
  }
  if (providerOrder.id !== operation.mp_order_id ||
      providerOrder.external_reference !== operation.external_reference) {
    return { verified: false, reason: 'PROVIDER_ORDER_MISMATCH' };
  }
  if (providerOrder.status !== 'processed' ||
      providerOrder.payment_status !== 'approved' ||
      providerOrder.payment_id !== operation.mp_payment_id) {
    return { verified: false, reason: 'PROVIDER_PAYMENT_NOT_APPROVED' };
  }
  const amount = Number(providerOrder.amount);
  if (!Number.isSafeInteger(amount) || amount <= 0 ||
      !Number.isSafeInteger(Number(invoice.total)) ||
      amount !== Number(invoice.total) ||
      amount !== Number(operation.amount) ||
      operation.currency !== 'CLP' ||
      (invoice.currency && invoice.currency !== 'CLP')) {
    return { verified: false, reason: 'AMOUNT_OR_CURRENCY_MISMATCH' };
  }
  return {
    verified: true,
    proof: {
      verified_by_server: true,
      provider: 'mercado_pago',
      channel: 'point',
      status: 'approved',
      provider_payment_id: providerOrder.payment_id,
      business_id: invoice.business_id,
      sale_id: invoice.id,
      currency: 'CLP',
      amount,
    },
  };
}
