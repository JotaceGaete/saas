// Server-side pilot worker. Verifies Point again and prepares only a pending
// fiscal operation. Does not emit a DTE, charge a customer, or mutate CRM payments.
const {prepareFinalizedPointFiscal}=require('./point-finalized-fiscal.cjs');
const PILOT='cda904a1-e331-4bd4-9f33-a6715687d3dd';
async function processPointFiscalOutboxItem({
 item,db,loadSale,getMerchantAccessToken,prepareFiscal,fetchImpl
}) {
 if(!item||item.business_id!==PILOT||item.status!=='processing'||
    !item.point_operation_id||!item.sale_id)
  return {status:'blocked',reason:'OUTBOX_NOT_ELIGIBLE',emissionEnabled:false};
 const result=await prepareFinalizedPointFiscal({
  db,businessId:item.business_id,saleId:item.sale_id,
  loadSale,getMerchantAccessToken,prepareFiscal,fetchImpl
 });
 return result.status==='prepared'
  ? {status:'prepared',operationKey:result.operationKey,emissionEnabled:false}
  : {status:'blocked',reason:result.reason||'RECONCILIATION_REQUIRED',emissionEnabled:false};
}
module.exports={processPointFiscalOutboxItem,PILOT};
