import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDteCoreFiscalReconciliation } from '../../api/_lib/siisolutions-dtecore-reconciliation.js';
const businessId='11111111-1111-4111-8111-111111111111';
const saleId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId='WLK-'+businessId+'-'+saleId;
const input={businessId,saleId,operationId};
const env={SIISOLUTIONS_RECONCILIATION_ENABLED:'verified-readonly'};
function db(){
  const calls=[];
  const q={eq(){return q;},async maybeSingle(){return {data:{business_id:businessId,sale_id:saleId,operation_id:operationId,status:'unknown',dte_type:39,provider:'siisolutions'},error:null};}};
  return {calls,from(){return {select(){return q;}};},async rpc(name,args){calls.push([name,args]);return {data:true,error:null};}};
}
function setup(overrides={}){
  const calls=[];
  const admin=db();
  const options={admin,apiKey:'server-test-key',env,
    resolveExistingFolio:async()=>321,
    decodeOriginalDocuments:async()=>({folio:321,xmlBase64:'eG1s',pdfBase64:'cGRm'}),
    verifyOriginal:async()=>true,
    fetchImpl:async(url,init)=>{calls.push({url,init});return {ok:true,json:async()=>({test:true})};},
    ...overrides,
  };
  return {admin,calls,reconcile:createDteCoreFiscalReconciliation(options)};
}
test('read-only XML and PDF retrieval precedes verified reconciliation',async()=>{
  const {admin,calls,reconcile}=setup();
  assert.deepEqual(await reconcile(input),{state:'issued',folio:321});
  assert.deepEqual(calls.map(c=>new URL(c.url).pathname),[
    '/dte/documentos/39/321/xml','/dte/documentos/39/321/pdf',
  ]);
  assert.ok(calls.every(c=>c.init.method==='GET'));
  assert.equal(admin.calls.length,1);
});
test('missing folio prevents retrieval and DB update',async()=>{
  const {admin,calls,reconcile}=setup({resolveExistingFolio:async()=>null});
  assert.equal((await reconcile(input)).reason,'ORIGINAL_AUTHENTICITY_NOT_VERIFIED');
  assert.equal(calls.length,0);assert.equal(admin.calls.length,0);
});
test('independent verification failure prevents DB update',async()=>{
  const {admin,reconcile}=setup({verifyOriginal:async()=>false});
  assert.equal((await reconcile(input)).reason,'ORIGINAL_AUTHENTICITY_NOT_VERIFIED');
  assert.equal(admin.calls.length,0);
});
test('disabled gate refuses construction',()=>{
  assert.throws(()=>setup({env:{}}),/disabled/);
});
