// Fiscal eligibility for cash and Point. Inputs must be assembled on a trusted
// server from persisted sales/payments, never from a browser request body.
export function assessBoletaEligibility({ sale, payment, businessId, issuerBusinessId }) {
  if (!businessId || issuerBusinessId !== businessId) return { eligible: false, reason: 'ISSUER_MISMATCH' };
  if (!sale?.id || sale.business_id !== businessId || sale.status !== 'pagada') return { eligible: false, reason: 'SALE_NOT_PAID' };
  if (!payment || payment.business_id !== businessId || payment.sale_id !== sale.id) return { eligible: false, reason: 'PAYMENT_MISMATCH' };
  const total = Number(sale.total);
  if (!Number.isSafeInteger(total) || total <= 0 || payment.currency !== 'CLP' || Number(payment.amount) !== total) {
    return { eligible: false, reason: 'AMOUNT_MISMATCH' };
  }
  if (payment.method === 'cash') {
    // Must originate from an authenticated cashier checkout persisted by the
    // server; a client-supplied cash flag is not proof of receipt.
    if (payment.received_by_cashier !== true || payment.voided_at || payment.status !== 'received') {
      return { eligible: false, reason: 'CASH_NOT_RECEIVED' };
    }
    return { eligible: true, method: 'cash', reason: null };
  }
  if (payment.method === 'mercado_pago') {
    if (payment.provider !== 'mercado_pago' || payment.channel !== 'point') {
      return { eligible: false, reason: 'NOT_POINT' };
    }
    if (payment.verified_by_server !== true || payment.status !== 'approved' || !payment.provider_payment_id) {
      return { eligible: false, reason: 'POINT_NOT_APPROVED' };
    }
    return { eligible: true, method: 'mercado_pago', reason: null };
  }
  return { eligible: false, reason: 'UNSUPPORTED_PAYMENT_METHOD' };
}
