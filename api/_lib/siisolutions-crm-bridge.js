/**
 * Convert persisted Walinka CRM records to the fiscal adapter's shape.
 * Must run on a trusted server after reloading the invoice and payments.
 * This does NOT authorize or initiate a fiscal emission.
 */
export function normalizeCrmFiscalSale({ invoice, items, payments }) {
  if (!invoice?.id || !invoice.business_id) return { ready: false, reason: 'INVOICE_MISSING' };
  if (invoice.status === 'anulada') return { ready: false, reason: 'INVOICE_VOIDED' };
  if (invoice.status !== 'pagada') return { ready: false, reason: 'INVOICE_NOT_PAID' };
  if (invoice.currency && invoice.currency !== 'CLP') return { ready: false, reason: 'CURRENCY_UNSUPPORTED' };

  const total = Number(invoice.total);
  if (!Number.isSafeInteger(total) || total <= 0) return { ready: false, reason: 'TOTAL_INVALID' };
  const received = (payments || []).filter(p =>
    p.payment_status === 'received' && !p.voided_at && p.payment_method !== 'credit');
  const sumPaid = received.reduce((sum, p) => sum + Number(p.amount), 0);
  if (sumPaid !== total) return { ready: false, reason: 'PAYMENT_TOTAL_MISMATCH' };
  // Pilot handles one confirmed payment only. Mixed tender requires a
  // separate approved fiscal representation before it can be enabled.
  if (received.length !== 1) return { ready: false, reason: 'MIXED_PAYMENTS_UNSUPPORTED' };
  const payment = received[0];
  if (payment.payment_method !== 'cash') {
    return { ready: false, reason: 'PAYMENT_VERIFICATION_REQUIRED' };
  }
  // CRM's received payment row is not enough to prove who confirmed cash.
  // Server must separately verify cashier identity/authorization.
  const sourceItems = Array.isArray(items) ? items : invoice.crm_invoice_items;
  if (!Array.isArray(sourceItems) || sourceItems.length === 0) return { ready: false, reason: 'ITEMS_MISSING' };
  const fiscalItems = sourceItems.map(it => ({
    description: it.name || it.description,
    sku: it.sku || '',
    unitPrice: Number(it.unit_price),
    quantity: Number(it.quantity),
    subtotal: Number(it.subtotal),
  }));
  if (fiscalItems.some(it => !Number.isSafeInteger(it.unitPrice) ||
    !Number.isSafeInteger(it.quantity) || it.quantity <= 0 ||
    !Number.isSafeInteger(it.subtotal) || it.subtotal !== it.unitPrice * it.quantity)) {
    return { ready: false, reason: 'DISCOUNT_OR_ITEM_MISMATCH' };
  }
  if (fiscalItems.reduce((sum, it) => sum + it.subtotal, 0) !== total) {
    return { ready: false, reason: 'INVOICE_DISCOUNT_UNSUPPORTED' };
  }
  return {
    ready: true,
    sale: { id: invoice.id, business_id: invoice.business_id, status: 'pagada', total, items: fiscalItems },
    payment: { business_id: invoice.business_id, sale_id: invoice.id, method: 'cash', amount: total, currency: 'CLP', status: 'received', received_by_cashier: false },
    requiresCashierVerification: true,
  };
}
