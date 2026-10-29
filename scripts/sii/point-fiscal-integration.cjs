// Backend composition for Mercado Pago Point -> CRM payment ledger -> fiscal preparation.
// No HTTP route, no DTE emission. All callbacks must use server-side credentials/DB.
const {coordinatePointFiscalPreparation}=require('./point-fiscal-coordinator.cjs');
const {fetchPointPayment}=require('./mercado-pago-point-payment.cjs');
async function prepareFiscalAfterPointApproval({
 businessId,saleId,pointPaymentId,loadSale,loadPointOrderBinding,
 getMerchantAccessToken,isPaymentLinked,recordPayment,prepareFiscal,
 fetchImpl
}) {
 if([loadSale,loadPointOrderBinding,getMerchantAccessToken,isPaymentLinked,recordPayment,prepareFiscal]
   .some(fn=>typeof fn!=='function'))
  return {status:'blocked',reason:'INTEGRATION_NOT_CONFIGURED',emissionEnabled:false};
 return coordinatePointFiscalPreparation({
  businessId,saleId,pointPaymentId,loadSale,isPaymentLinked,recordPayment,prepareFiscal,
  verifyPointPayment:async ({businessId,saleId,pointPaymentId})=>{
   // Point order must be loaded from the merchant's persisted, trusted DB record.
   const binding=await loadPointOrderBinding({businessId,saleId});
   if(!binding || binding.businessId!==businessId || binding.saleId!==saleId ||
      !binding.orderId || binding.paymentId && String(binding.paymentId)!==String(pointPaymentId))
    throw new Error('POINT_ORDER_BINDING_NOT_FOUND');
   const accessToken=await getMerchantAccessToken({businessId});
   return fetchPointPayment({businessId,saleId,pointPaymentId,
    expectedOrderId:binding.orderId,accessToken,fetchImpl});
  }
 });
}
module.exports={prepareFiscalAfterPointApproval};
