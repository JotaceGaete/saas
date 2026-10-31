import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateManualFiscalReconciliation } from '../../api/_lib/siisolutions-manual-reconciliation.js';

const businessId='11111111-1111-4111-8111-111111111111';
const saleId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId='WLK-'+businessId+'-'+saleId;
const ledger={business_id:businessId,sale_id:saleId,operation_id:operationId,status:'unknown',provider:'siisolutions',dte_type:39};
const document={businessId,saleId,operationId,provider:'siisolutions',dteType:39,verifiedByTrustedOperator:true,folio:123,xmlBase64:'eG1s',pdfBase64:'cGRm'};
const check=(l=ledger,d=document)=>validateManualFiscalReconciliation({ledger:l,businessId,saleId,operationId,document:d});

test('trusted original document can resolve unknown ledger',()=>{
  assert.deepEqual(check(),{ready:true,folio:123,xmlBase64:'eG1s',pdfBase64:'cGRm'});
});
test('cannot reconcile an already issued or sending ledger',()=>{
  for(const status of ['sending','issued','failed','pending']) assert.equal(check({...ledger,status}).ready,false);
});
test('cross-business and cross-sale originals are blocked',()=>{
  assert.equal(check(ledger,{...document,businessId:'22222222-2222-4222-8222-222222222222'}).ready,false);
  assert.equal(check(ledger,{...document,saleId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'}).ready,false);
  assert.equal(check(ledger,{...document,operationId:'other-operation'}).ready,false);
});
test('unverified, incomplete or wrong DTE originals are blocked',()=>{
  for(const changed of [{verifiedByTrustedOperator:false},{pdfBase64:''},{xmlBase64:''},{folio:0},{dteType:41}]) {
    assert.equal(check(ledger,{...document,...changed}).ready,false);
  }
});
