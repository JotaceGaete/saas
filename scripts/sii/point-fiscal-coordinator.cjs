// Server-only orchestration boundary; does not issue DTE or call Mercado Pago directly.
// Caller must implement authoritative DB reads, trusted Point verification,
// durable unique payment linkage and idempotent fiscal preparation.
const {assessPointConfirmation}=require('./point-fiscal-decision.cjs');
async function coordinatePointFiscalPreparation({
 businessId,saleId,pointPaymentId,loadSale,verifyPointPayment,
 isPaymentLinked,recordPayment,prepareFiscal
}) {
 if(!businessId||!saleId||!pointPaymentId||
    [loadSale,verifyPointPayment,isPaymentLinked,recordPayment,prepareFiscal].some(fn=>typeof fn!=='function'))
   return {status:'blocked',reason:'COORDINATOR_NOT_CONFIGURED',emissionEnabled:false};
 try {
  const sale=await loadSale({businessId,saleId});
  if(!sale||sale.id!==saleId||sale.business_id!==businessId)
   return {status:'blocked',reason:'SALE_NOT_FOUND',emissionEnabled:false};
  const payment=await verifyPointPayment({businessId,saleId,pointPaymentId});
  // Payment status is independently obtained from provider, never browser input.
  const initial=await assessPointConfirmation({businessId,sale,expectedAmount:Number(sale.total),
   paymentAlreadyLinked:false,pointPaymentId,
   fetchVerifiedPayment:async()=>payment});
  if(initial.action!=='record_payment_first')
   return {status:'blocked',reason:initial.reason,emissionEnabled:false};
  const alreadyLinked=await isPaymentLinked({businessId,saleId,pointPaymentId});
  if(!alreadyLinked) await recordPayment({businessId,saleId,pointPaymentId,payment});
  // Re-read authoritative sale and ledger after the payment transaction.
  const settled=await loadSale({businessId,saleId});
  const linked=await isPaymentLinked({businessId,saleId,pointPaymentId});
  const decision=await assessPointConfirmation({businessId,sale:settled,
   expectedAmount:Number(settled?.total),paymentAlreadyLinked:linked===true,
   pointPaymentId,fetchVerifiedPayment:async()=>payment});
  if(decision.action!=='prepare_fiscal')
   return {status:'blocked',reason:decision.reason,emissionEnabled:false};
  const prepared=await prepareFiscal({businessId,saleId,operationKey:decision.operationKey});
  if(!prepared || prepared.operationKey!==decision.operationKey)
   return {status:'blocked',reason:'FISCAL_PREPARATION_UNCONFIRMED',emissionEnabled:false};
  return {status:'prepared',operationKey:decision.operationKey,emissionEnabled:false};
 } catch {
  // No automatic retry of payment or DTE submission on uncertain outcomes.
  return {status:'blocked',reason:'RECONCILIATION_REQUIRED',emissionEnabled:false};
 }
}
module.exports={coordinatePointFiscalPreparation};
