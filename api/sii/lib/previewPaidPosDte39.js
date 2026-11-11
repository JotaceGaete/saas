import { preparePosDte39 } from './preparePosDte39.js';
import { resolveDte39PaymentCode } from './posDte39Payment.js';
import { buildDte39Payload } from './dtecore39.js';

// Deterministic, side-effect-free DTE39 preview from persisted records.
// Does not reserve a folio or contact the tax provider.
export function previewPaidPosDte39({job, invoice, business, issuer, taxConfig, items, payments}) {
  if (!job || job.document_type !== 39 || job.invoice_id !== invoice?.id ||
      job.business_id !== invoice?.business_id) throw new Error('JOB_INVOICE_MISMATCH');
  if (!['pending','claimed'].includes(job.state)) throw new Error('FISCAL_JOB_NOT_PREVIEWABLE');
  // A Chilean card/Point voucher may itself be the fiscal receipt.
  // Never prepare a second DTE39 without a verified per-transaction voucher decision.
  if (payments?.some(p => ['card','debit_card','credit_card','mercado_pago'].includes(p.payment_method)))
    throw new Error('CARD_VOUCHER_CLASSIFICATION_REQUIRED');
  const paymentCode = resolveDte39PaymentCode(payments, invoice.total);
  const sale = preparePosDte39({
    invoice, business, issuer, taxConfig, items,
    operationId: job.operation_id, paymentCode
  });
  const payload = buildDte39Payload(sale);
  return {ready:true,documentType:39,total:payload.total,
    lines:payload.detalles.length,paymentCode:payload.medioPago,
    operationId:payload.idBoletaOperacion};
}
