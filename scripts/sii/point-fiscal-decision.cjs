// Server-only Mercado Pago Point -> DTE39 decision. No API calls or fiscal emission.
// This module never trusts a browser-supplied payment status.
const POSITIVE = new Set(['approved']);
function decidePointFiscalAction({sale, payment, businessId, expectedAmount, paymentAlreadyLinked=false}) {
 if (!businessId || !sale || sale.business_id !== businessId || !sale.id)
   return {action:'block',reason:'TENANT_OR_SALE_MISMATCH'};
 if (!payment || !payment.id || !payment.order_id || payment.business_id !== businessId ||
     payment.sale_id !== sale.id || payment.source !== 'mercado_pago_point' ||
     payment.verifiedByServer !== true)
   return {action:'block',reason:'POINT_PAYMENT_NOT_VERIFIED'};
 if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0 ||
     !Number.isSafeInteger(payment.amount) || payment.amount !== expectedAmount ||
     !Number.isSafeInteger(Number(sale.total)) || Number(sale.total) !== expectedAmount)
   return {action:'block',reason:'AMOUNT_MISMATCH'};
 if (!POSITIVE.has(payment.status))
   return {action:'block',reason:'POINT_PAYMENT_NOT_APPROVED'};
 if (paymentAlreadyLinked !== true)
   return {action:'record_payment_first',reason:'PAYMENT_LEDGER_NOT_RECONCILED'};
 if (sale.status !== 'pagada' || !sale.paid_at)
   return {action:'block',reason:'SALE_NOT_SETTLED'};
 // Approval is a trigger for preparation, NOT authorization to emit.
 return {action:'prepare_fiscal',reason:'POINT_APPROVED',operationKey:`${businessId}:${sale.id}:39`,
         emissionEnabled:false,requiresProviderContractVerification:true};
}
module.exports={decidePointFiscalAction};
