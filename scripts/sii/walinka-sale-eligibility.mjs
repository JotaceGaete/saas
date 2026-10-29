// SERVER ONLY. Deterministic checks for a Walinka CRM note of sale.
// Passing these checks is necessary, NOT sufficient, for SII issuance.
// Actual tax classification, payment reconciliation and transactional binding
// must be verified by the database before CAF reservation.
export function assessWalinkaCrmSale({sale, items, businessId}) {
  const deny = reason => ({eligible:false,reason});
  if (!sale || sale.business_id !== businessId) return deny('TENANT_MISMATCH');
  if (sale.status !== 'pagada' || !sale.paid_at) return deny('UNPAID_SALE');
  if (!Number.isSafeInteger(Number(sale.total)) || Number(sale.total) <= 0)
    return deny('INVALID_TOTAL');
  if (!Array.isArray(items) || items.length === 0) return deny('EMPTY_ITEMS');
  if (items.some(i => i.invoice_id !== sale.id ||
      !Number.isFinite(Number(i.quantity)) || Number(i.quantity) <= 0 ||
      !Number.isFinite(Number(i.unit_price)) || Number(i.unit_price) < 0 ||
      !Number.isFinite(Number(i.subtotal)) || Number(i.subtotal) < 0))
    return deny('INVALID_ITEMS');
  const total = items.reduce((sum,i)=>sum+Number(i.subtotal),0);
  if (Math.abs(total-Number(sale.total))>0.01) return deny('TOTAL_MISMATCH');
  return {eligible:true,reason:null,total:Number(sale.total)};
}
