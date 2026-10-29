import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConfiguredFiscalReconciliation } from '../../api/_lib/siisolutions-reconciliation-pilot.js';

const businessId='11111111-1111-4111-8111-111111111111';
const saleId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId='WLK-'+businessId+'-'+saleId;
const input={businessId,saleId,operationId};
const original={...input,source:'authenticated-provider-read',provider:'siisolutions',dteType:39,folio:123,xmlBase64:'eG1s',pdfBase64:'cGRm'};
function admin(){
  let rpcCount=0;
  const q={eq(){return q;},async maybeSingle(){return {data:{business_id:businessId,sale_id:saleId,operation_id:operationId,provider:'siisolutions',dte_type:39,status:'unknown'},error:null};}};
  return {get rpcCount(){return rpcCount;},from(){return {select(){return q;}};},async rpc(){rpcCount++;return {data:true,error:null};}};
}
test('composed reconciliation uses trusted read-only original and independent verification',async()=>{
  const db=admin();
  const reconcile=createConfiguredFiscalReconciliation({env:{SIISOLUTIONS_RECONCILIATION_ENABLED:'verified-readonly'},admin:db,retrieveOriginal:async()=>original,verifyOriginal:async()=>true});
  assert.deepEqual(await reconcile(input),{state:'issued',folio:123});
  assert.equal(db.rpcCount,1);
});
test('unverified original cannot update ledger',async()=>{
  const db=admin();
  const reconcile=createConfiguredFiscalReconciliation({env:{SIISOLUTIONS_RECONCILIATION_ENABLED:'verified-readonly'},admin:db,retrieveOriginal:async()=>original,verifyOriginal:async()=>false});
  assert.equal((await reconcile(input)).reason,'ORIGINAL_AUTHENTICITY_NOT_VERIFIED');
  assert.equal(db.rpcCount,0);
});
test('retrieval with mismatched tenant cannot update ledger',async()=>{
  const db=admin();
  const reconcile=createConfiguredFiscalReconciliation({env:{SIISOLUTIONS_RECONCILIATION_ENABLED:'verified-readonly'},admin:db,retrieveOriginal:async()=>({...original,businessId:'other'}),verifyOriginal:async()=>true});
  assert.equal((await reconcile(input)).reason,'ORIGINAL_AUTHENTICITY_NOT_VERIFIED');
  assert.equal(db.rpcCount,0);
});
test('composition refuses missing verifier or retrieval',()=>{
  assert.throws(()=>createConfiguredFiscalReconciliation({env:{SIISOLUTIONS_RECONCILIATION_ENABLED:'verified-readonly'},admin:admin(),retrieveOriginal:async()=>original}),/required/);
});

test('reconciliation disabled by default even with valid provider adapters',()=>{
  assert.throws(()=>createConfiguredFiscalReconciliation({
    admin:admin(),retrieveOriginal:async()=>original,verifyOriginal:async()=>true,env:{},
  }),/disabled/);
});
