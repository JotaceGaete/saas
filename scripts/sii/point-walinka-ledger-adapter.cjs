// Read-only adapter to Walinka's existing Point/CRM schema.
// Must be called server-side with a trusted Supabase client; never from the browser.
async function loadWalinkaPointBinding({db,businessId,saleId}) {
 if(!db||!businessId||!saleId) throw Error('POINT_BINDING_ARGS_INVALID');
 const {data,error}=await db.from('crm_pos_point_operations')
  .select('id,business_id,crm_invoice_id,mp_order_id,mp_payment_id,mp_status,amount,currency,finalized_at')
  .eq('business_id',businessId).eq('crm_invoice_id',saleId)
  .limit(2);
 if(error) throw Error('POINT_BINDING_LOOKUP_FAILED');
 if(!Array.isArray(data)||data.length!==1) throw Error('POINT_BINDING_NOT_UNIQUE');
 const row=data[0];
 if(row.business_id!==businessId||row.crm_invoice_id!==saleId||
    !row.mp_order_id||!row.mp_payment_id||row.currency!=='CLP'||
    row.mp_status!=='processed'||!row.finalized_at||
    !Number.isSafeInteger(Number(row.amount))||Number(row.amount)<=0)
  throw Error('POINT_BINDING_INCOMPLETE');
 return {businessId,saleId,operationId:row.id,orderId:String(row.mp_order_id),
  paymentId:String(row.mp_payment_id),pointStatus:row.mp_status,amount:Number(row.amount)};
}
async function isWalinkaPointPaymentLinked({db,businessId,saleId,pointPaymentId}) {
 if(!db||!businessId||!saleId||!pointPaymentId) return false;
 const {data,error}=await db.from('crm_pos_point_operations')
  .select('id,business_id,mp_payment_id,mp_order_id,crm_invoice_id,mp_status,amount,currency,finalized_at')
  .eq('business_id',businessId).eq('crm_invoice_id',saleId)
  .eq('mp_payment_id',String(pointPaymentId)).limit(2);
 if(error) throw Error('POINT_LEDGER_LOOKUP_FAILED');
 if(!Array.isArray(data)||data.length!==1) return false;
 const op=data[0];
 // Walinka's crm_finalize_point_sale only finalizes status "processed".
 if(op.business_id!==businessId||op.crm_invoice_id!==saleId||
    String(op.mp_payment_id)!==String(pointPaymentId)||
    op.mp_status!=='processed'||!op.finalized_at||!op.mp_order_id||op.currency!=='CLP'||
    !Number.isSafeInteger(Number(op.amount))||Number(op.amount)<=0)
  return false;
 const {data:payments,error:payError}=await db.from('crm_payments')
  .select('id,invoice_id,business_id,amount,currency,payment_method,payment_status,voided_at,reference')
  .eq('business_id',businessId).eq('invoice_id',saleId).limit(20);
 if(payError) throw Error('CRM_PAYMENT_LOOKUP_FAILED');
 // Exact reference written by crm_finalize_point_sale: 'Point ' || mp_order_id.
 const matches=(payments||[]).filter(p=>p.business_id===businessId&&p.invoice_id===saleId&&
  p.reference==='Point '+op.mp_order_id&&p.payment_method==='mercado_pago'&&
  p.payment_status==='received'&&!p.voided_at&&p.currency===op.currency&&
  Number.isSafeInteger(Number(p.amount))&&Number(p.amount)===Number(op.amount));
 return matches.length===1;
}
module.exports={loadWalinkaPointBinding,isWalinkaPointPaymentLinked};
