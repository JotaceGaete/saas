// Read-only adapter to Walinka's existing Point/CRM schema.
// Must be called server-side with a trusted Supabase client; never from the browser.
async function loadWalinkaPointBinding({db,businessId,saleId}) {
 if(!db||!businessId||!saleId) throw Error('POINT_BINDING_ARGS_INVALID');
 const {data,error}=await db.from('crm_pos_point_operations')
  .select('id,business_id,crm_invoice_id,mp_order_id,mp_payment_id,mp_status,amount,currency')
  .eq('business_id',businessId).eq('crm_invoice_id',saleId)
  .limit(2);
 if(error) throw Error('POINT_BINDING_LOOKUP_FAILED');
 if(!Array.isArray(data)||data.length!==1) throw Error('POINT_BINDING_NOT_UNIQUE');
 const row=data[0];
 if(row.business_id!==businessId||row.crm_invoice_id!==saleId||
    !row.mp_order_id||!row.mp_payment_id||row.currency!=='CLP')
  throw Error('POINT_BINDING_INCOMPLETE');
 return {businessId,saleId,operationId:row.id,orderId:String(row.mp_order_id),
  paymentId:String(row.mp_payment_id),pointStatus:row.mp_status,amount:Number(row.amount)};
}
async function isWalinkaPointPaymentLinked({db,businessId,saleId,pointPaymentId}) {
 if(!db||!businessId||!saleId||!pointPaymentId) return false;
 const {data,error}=await db.from('crm_pos_point_operations')
  .select('id,mp_payment_id,crm_invoice_id,mp_status')
  .eq('business_id',businessId).eq('crm_invoice_id',saleId)
  .eq('mp_payment_id',String(pointPaymentId)).limit(2);
 if(error) throw Error('POINT_LEDGER_LOOKUP_FAILED');
 if(!Array.isArray(data)||data.length!==1||data[0].mp_status!=='approved') return false;
 const {data:payments,error:payError}=await db.from('crm_payments')
  .select('id,invoice_id,business_id,amount,payment_status,voided_at,reference')
  .eq('business_id',businessId).eq('invoice_id',saleId).limit(20);
 if(payError) throw Error('CRM_PAYMENT_LOOKUP_FAILED');
 // Reference semantics differ across POS versions; do not assume it stores MP payment ID.
 // Fail closed until a durable payment-to-Point-operation mapping is established.
 return false;
}
module.exports={loadWalinkaPointBinding,isWalinkaPointPaymentLinked};
