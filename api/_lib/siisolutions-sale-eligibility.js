// Read-only gate for future fiscal emission. This module does not charge or emit.
// Only a verified provider-approved payment may qualify for automatic Point issuance.
export function assessPointBoletaEligibility({ sale, payment, businessId, issuerBusinessId }) {
  if (!businessId || businessId !== issuerBusinessId) return { eligible: false, reason: 'ISSUER_MISMATCH' };
  if (!sale?.id || sale.business_id !== businessId || sale.status === 'anulada') return { eligible: false, reason: 'SALE_MISMATCH' };
  if (!payment || payment.business_id !== businessId || payment.sale_id !== sale.id) return { eligible: false, reason: 'PAYMENT_MISMATCH' };
  if (payment.provider !== 'mercado_pago' || payment.channel !== 'point') return { eligible: false, reason: 'NOT_POINT' };
  // This flag must be populated by trusted server-to-server MP verification,
  // NEVER from a browser callback or client-submitted JSON.
  if (payment.verified_by_server !== true || payment.status !== 'approved' || !payment.provider_payment_id) {
    return { eligible: false, reason: 'PAYMENT_UNVERIFIED' };
  }
  const total = Number(sale.total);
  if (!Number.isSafeInteger(total) || total <= 0 || payment.currency !== 'CLP' || Number(payment.amount) !== total) {
    return { eligible: false, reason: 'AMOUNT_MISMATCH' };
  }
  return { eligible: true, reason: null };
}
