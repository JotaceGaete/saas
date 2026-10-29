// Server-only Mercado Pago payment normalization. This does NOT make network calls.
// Caller must fetch GET /v1/payments/{id} using the merchant's secret access token.
// Bind external_reference and metadata to an independently loaded CRM sale.
function normalizePointPayment({providerPayment,businessId,saleId,pointPaymentId,expectedOrderId}) {
 if(!providerPayment || typeof providerPayment!=='object' ||
    !businessId || !saleId || !pointPaymentId || !expectedOrderId)
  return null;
 if(String(providerPayment.id)!==String(pointPaymentId) ||
    String(providerPayment.order?.id ?? '')!==String(expectedOrderId))
  return null;
 // A trusted order->sale binding must be verified from Walinka's own DB.
 // Never infer the sale from untrusted provider metadata or browser parameters.
 const amount=providerPayment.transaction_amount;
 if(typeof amount!=='number'||!Number.isSafeInteger(amount)||amount<=0)
  return null;
 const status=providerPayment.status;
 if(typeof status!=='string') return null;
 return {id:String(providerPayment.id),order_id:String(expectedOrderId),
   business_id:businessId,sale_id:saleId,source:'mercado_pago_point',
   verifiedByServer:true,status,amount};
}
module.exports={normalizePointPayment};
