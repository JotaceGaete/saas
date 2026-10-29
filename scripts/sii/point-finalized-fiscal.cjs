// Server-side bridge for EXISTING Walinka Point finalization.
// crm_finalize_point_sale has already written crm_invoices + crm_payments.
// Never create a second CRM payment or attempt DTE emission here.
const {fetchPointPayment}=require('./mercado-pago-point-payment.cjs');
const {loadWalinkaPointBinding,isWalinkaPointPaymentLinked}=require('./point-walinka-ledger-adapter.cjs');
async function prepareFinalizedPointFiscal({
 db,businessId,saleId,loadSale,getMerchantAccessToken,prepareFiscal,fetchImpl
}) {
 if(!db||!businessId||!saleId||typeof loadSale!=='function'||
  typeof getMerchantAccessToken!=='function'||typeof prepareFiscal!=='function')
  return {status:'blocked',reason:'NOT_CONFIGURED',emissionEnabled:false};
 try {
  const binding=await loadWalinkaPointBinding({db,businessId,saleId});
  // "processed" is Walinka's Point terminal completion status, not MP's payment status.
  if(binding.pointStatus!=='processed')
   return {status:'blocked',reason:'POINT_NOT_FINALIZED',emissionEnabled:false};
  const sale=await loadSale({businessId,saleId});
  if(!sale||sale.id!==saleId||sale.business_id!==businessId||
     sale.status!=='pagada'||!sale.paid_at||
     !Number.isSafeInteger(Number(sale.total))||Number(sale.total)<=0||
     Number(sale.total)!==binding.amount)
   return {status:'blocked',reason:'SALE_NOT_SETTLED',emissionEnabled:false};
  // The live Point integration uses Mercado Pago Orders API and status 'processed'.
  // The /v1/payments endpoint may not expose an order.id for these Point orders.
  // Until the provider contract is verified, do not assume the payment lookup proves the order.
  if(process.env.SII_POINT_PAYMENT_LOOKUP_CONTRACT_VERIFIED!=='true')
   return {status:'blocked',reason:'POINT_PROVIDER_CONTRACT_UNVERIFIED',emissionEnabled:false};
  const accessToken=await getMerchantAccessToken({businessId});
  const payment=await fetchPointPayment({accessToken,pointPaymentId:binding.paymentId,
   businessId,saleId,expectedOrderId:binding.orderId,fetchImpl});
  if(payment.status!=='approved'||payment.amount!==Number(sale.total))
   return {status:'blocked',reason:'POINT_NOT_APPROVED',emissionEnabled:false};
  const linked=await isWalinkaPointPaymentLinked({db,businessId,saleId,pointPaymentId:binding.paymentId});
  if(linked!==true)
   return {status:'blocked',reason:'POINT_CRM_PAYMENT_NOT_RECONCILED',emissionEnabled:false};
  const operationKey=businessId+':'+saleId+':39';
  const prepared=await prepareFiscal({businessId,saleId,operationKey});
  if(!prepared||prepared.operationKey!==operationKey||prepared.status!=='pending')
   return {status:'blocked',reason:'FISCAL_PREPARATION_UNCONFIRMED',emissionEnabled:false};
  return {status:'prepared',operationKey,emissionEnabled:false};
 } catch {
  return {status:'blocked',reason:'RECONCILIATION_REQUIRED',emissionEnabled:false};
 }
}
module.exports={prepareFinalizedPointFiscal};
