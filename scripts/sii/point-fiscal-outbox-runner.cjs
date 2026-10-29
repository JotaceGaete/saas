// Server-only orchestration. A separate authorized endpoint/cron may invoke this.
// No DTE emission, CRM writes or payment charges. Claim is atomic in PostgreSQL.
const {processPointFiscalOutboxItem}=require('./point-fiscal-outbox-worker.cjs');
async function runPointFiscalOutboxBatch({db,loadSale,getMerchantAccessToken,prepareFiscal,fetchImpl,limit=5}) {
 if(!db||!Number.isInteger(limit)||limit<1||limit>20)
  throw new Error('INVALID_WORKER_CONFIGURATION');
 const {data:items,error:claimError}=await db.rpc('crm_claim_point_fiscal_pilot',{p_limit:limit});
 if(claimError) throw new Error('OUTBOX_CLAIM_FAILED');
 if(!Array.isArray(items)) throw new Error('OUTBOX_CLAIM_INVALID_RESPONSE');
 const results=[];
 for(const item of items){
  let outcome;
  try{
   outcome=await processPointFiscalOutboxItem({
    item:{...item,status:'processing'},db,loadSale,getMerchantAccessToken,prepareFiscal,fetchImpl
   });
  }catch{
   outcome={status:'blocked',reason:'WORKER_EXCEPTION',emissionEnabled:false};
  }
  const finalStatus=outcome.status==='prepared'?'prepared':'blocked';
  const {data:completed,error:completionError}=await db.rpc('crm_complete_point_fiscal_pilot',{
   p_id:item.id,p_status:finalStatus,p_error_code:finalStatus==='blocked'?(outcome.reason||'RECONCILIATION_REQUIRED'):null
  });
  if(completionError||completed!==true){
   results.push({id:item.id,status:'completion_unconfirmed'});
   continue;
  }
  results.push({id:item.id,status:finalStatus});
 }
 return {claimed:items.length,results,emissionEnabled:false};
}
module.exports={runPointFiscalOutboxBatch};
