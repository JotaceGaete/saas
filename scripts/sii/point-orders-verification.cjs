// Matches the Mercado Pago Orders API contract used by Walinka's deployed
// mp-point-get-order / mp-point-reconcile Edge Functions.
function normalizePointOrder({raw,operation,businessId,saleId}) {
 if(!raw||!operation||operation.business_id!==businessId||
  operation.crm_invoice_id!==saleId||operation.mp_status!=='processed'||
  !operation.finalized_at||operation.currency!=='CLP') return null;
 const payments=raw.transactions?.payments;
 if(!Array.isArray(payments)||payments.length!==1) return null;
 const payment=payments[0];
 const amount=Number(payment.amount);
 if(String(raw.id)!==String(operation.mp_order_id)||
  String(raw.external_reference)!==String(operation.external_reference)||
  raw.status!=='processed'||!['approved','processed'].includes(payment.status)||
  String(payment.id)!==String(operation.mp_payment_id)||
  !Number.isSafeInteger(amount)||amount<=0||amount!==Number(operation.amount)) return null;
 return {id:String(payment.id),order_id:String(raw.id),business_id:businessId,
  sale_id:saleId,source:'mercado_pago_point',status:'approved',
  amount,verifiedByServer:true};
}
async function fetchVerifiedPointOrder({accessToken,operation,businessId,saleId,fetchImpl=globalThis.fetch}) {
 if(typeof accessToken!=='string'||!accessToken.trim()||!operation?.mp_order_id||
  typeof fetchImpl!=='function') throw Error('POINT_ORDER_CONFIG_INVALID');
 const response=await fetchImpl('https://api.mercadopago.com/v1/orders/'+encodeURIComponent(String(operation.mp_order_id)),{
  headers:{Authorization:'Bearer '+accessToken,Accept:'application/json'},method:'GET'});
 if(!response.ok) throw Error('POINT_ORDER_LOOKUP_FAILED');
 const payment=normalizePointOrder({raw:await response.json(),operation,businessId,saleId});
 if(!payment) throw Error('POINT_ORDER_VERIFICATION_FAILED');
 return payment;
}
module.exports={normalizePointOrder,fetchVerifiedPointOrder};
