export function isPersistedInvoiceInconsistent(invoice) {
  if (!invoice?.id) return false;
  return Number(invoice.total || 0) > 0 && (!Array.isArray(invoice.crm_invoice_items) || invoice.crm_invoice_items.length === 0);
}
