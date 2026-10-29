import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createManualFiscalReconciler } from '../../api/_lib/siisolutions-reconciliation-service.js';

const businessId='11111111-1111-4111-8111-111111111111';
const saleId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId='WLK-'+businessId+'-'+saleId;
const ledger={business_id:businessId,sale_id:saleId,operation_id:operationId,status:'unknown',dte_type:39,provider:'siisolutions'};
const original={businessId,saleId,operationId,dteType:39,provider:'siisolutions',verifiedByTrustedOperator:true,folio:121,xmlBase64:'eG1s',pdfBase64:'cGRm'};
function fakeAdmin(row=ledger,rpcResult=true) {
  const calls=[];
  const query={
    eq(){return query;},
    maybeSingle:async()=>({data:row,error:null}),
  };
  return {
    calls,
    from(name){calls.push(['from',name]);return {select:()=>query};},
    async rpc(name,args){calls.push(['rpc',name,args]);return {data:rpcResult,error:null};},
  };
}
test('reconciles unknown only with trusted original document',async()=>{
  const admin=fakeAdmin();
  const reconcile=createManualFiscalReconciler({admin,loadOriginalDocument:async()=>original});
  assert.deepEqual(await reconcile({businessId,saleId,operationId}),{state:'issued',folio:121});
  assert.equal(admin.calls.filter(c=>c[0]==='rpc').length,1);
});
test('issued ledger never loads document or calls RPC',async()=>{
  const admin=fakeAdmin({...ledger,status:'issued'});
  let fetched=false;
  const reconcile=createManualFiscalReconciler({admin,loadOriginalDocument:async()=>{fetched=true;return original;}});
  assert.equal((await reconcile({businessId,saleId,operationId})).reason,'UNKNOWN_LEDGER_REQUIRED');
  assert.equal(fetched,false);
  assert.equal(admin.calls.filter(c=>c[0]==='rpc').length,0);
});
test('cross-tenant original cannot finalize ledger',async()=>{
  const admin=fakeAdmin();
  const reconcile=createManualFiscalReconciler({admin,loadOriginalDocument:async()=>({...original,businessId:'other'})});
  assert.equal((await reconcile({businessId,saleId,operationId})).reason,'DOCUMENT_IDENTITY_NOT_VERIFIED');
  assert.equal(admin.calls.filter(c=>c[0]==='rpc').length,0);
});
test('concurrent state change fails closed',async()=>{
  const admin=fakeAdmin(ledger,false);
  const reconcile=createManualFiscalReconciler({admin,loadOriginalDocument:async()=>original});
  assert.equal((await reconcile({businessId,saleId,operationId})).reason,'ALREADY_RECONCILED_OR_STATE_CHANGED');
});
