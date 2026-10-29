import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeRegisteredBoletas as summarize} from './summarize-registered-boletas.mjs';
const scope={issuerRut:'76086428-5',documentType:39,day:'2026-10-28'};
const issued=(folio,gross,extra={})=>({...scope,folio,gross,exemptGross:0,status:'issued',siiAccepted:true,...extra});
test('summarizes accepted documents and independently voided folios',()=>{
 const r=summarize({...scope,documents:[issued(10,2000,{creditNoteApplied:true}),{...scope,folio:11,status:'voided_folio',siiAccepted:false},issued(12,3000)]});
 assert.equal(r.issued,2);assert.equal(r.voided,1);assert.equal(r.total,5000);
 assert.deepEqual(r.usedRanges,[{start:10,end:12}]);
 assert.deepEqual(r.voidedRanges,[{start:11,end:11}]);
 assert.equal(r.transmittable,false);
});
test('rejects paid but not accepted sales',()=>{
 assert.throws(()=>summarize({...scope,documents:[issued(1,100,{siiAccepted:false})]}),/ISSUED_DOCUMENT_NOT_ACCEPTED/);
});
test('rejects cross-business and cross-day documents',()=>{
 for(const change of [{issuerRut:'11111111-1'},{day:'2026-10-27'},{documentType:41}])
  assert.throws(()=>summarize({...scope,documents:[issued(1,100,change)]}),/DOCUMENT_SCOPE_MISMATCH/);
});
test('credit notes cannot void a folio',()=>{
 assert.throws(()=>summarize({...scope,documents:[issued(1,100,{creditNoteApplied:true,folioStatus:'voided'})]}),/CREDIT_NOTE_IS_NOT_FOLIO_VOID/);
});
test('accepted document cannot be voided as unused folio',()=>{
 assert.throws(()=>summarize({...scope,documents:[{...scope,folio:1,status:'voided_folio',siiAccepted:true}]}),/CANNOT_VOID_ISSUED_FOLIO/);
});
test('unknown document state is rejected',()=>{
 assert.throws(()=>summarize({...scope,documents:[{...scope,folio:1,status:'pending'}]}),/UNRECOGNIZED_DOCUMENT_STATE/);
});
