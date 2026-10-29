// Server-only Mercado Pago payment retrieval. Never expose accessToken to the browser.
// A provider payment lookup alone is not proof of a Walinka sale binding:
// expectedOrderId MUST originate from the merchant's own persisted Point order.
const {normalizePointPayment}=require('./point-provider-verification.cjs');
async function fetchPointPayment({accessToken,pointPaymentId,businessId,saleId,expectedOrderId,
 fetchImpl=globalThis.fetch,signal}) {
 if(typeof accessToken!=='string'||!accessToken.trim()||
    !/^[0-9]+$/.test(String(pointPaymentId||''))||
    !businessId||!saleId||!expectedOrderId||typeof fetchImpl!=='function')
  throw new Error('POINT_VERIFICATION_CONFIG_INVALID');
 const response=await fetchImpl('https://api.mercadopago.com/v1/payments/'+encodeURIComponent(String(pointPaymentId)),{
  method:'GET',headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},signal
 });
 if(!response.ok) throw new Error('POINT_PROVIDER_LOOKUP_FAILED');
 const providerPayment=await response.json();
 const payment=normalizePointPayment({providerPayment,businessId,saleId,pointPaymentId,expectedOrderId});
 if(!payment) throw new Error('POINT_PAYMENT_BINDING_FAILED');
 return payment;
}
module.exports={fetchPointPayment};
