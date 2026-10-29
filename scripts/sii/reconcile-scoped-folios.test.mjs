import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileScopedFolios as reconcile} from './reconcile-scoped-folios.mjs';
const scope={issuerRut:'76086428-5',documentType:39,day:'2026-10-28'};
const issued=(folio,amount,exemptAmount=0)=>({...scope,folio,status:'issued',amount,exemptAmount});
const voided=folio=>({...scope,folio,status:'voided'});
test('separates used and voided folio ranges and affected amounts',()=>{
 const r=reconcile({...scope,entries:[issued(3,2000,500),voided(2),issued(1,1000)]});
 assert.equal(r.issued,2);assert.equal(r.voided,1);assert.equal(r.total,3000);
 assert.equal(r.affectedTotal,2500);assert.equal(r.exemptTotal,500);
 assert.deepEqual(r.usedRanges,[{start:1,end:3}]);
 assert.deepEqual(r.voidedRanges,[{start:2,end:2}]);
 assert.equal(r.transmittable,false);assert.ok(Object.isFrozen(r.usedRanges[0]));
});
test('rejects another issuer or day or document type',()=>{
 for(const changed of [{issuerRut:'11111111-1'},{day:'2026-10-27'},{documentType:41}])
  assert.throws(()=>reconcile({...scope,entries:[{...issued(1,100),...changed}]}),/SCOPE_MISMATCH/);
});
test('rejects duplicate folios and amounts on unused folios',()=>{
 assert.throws(()=>reconcile({...scope,entries:[issued(1,100),voided(1)]}),/INVALID_OR_DUPLICATE_FOLIO/);
 assert.throws(()=>reconcile({...scope,entries:[{...voided(1),amount:0}]}),/VOIDED_WITH_AMOUNT/);
});
test('requires entirely exempt type 41',()=>{
 const s={...scope,documentType:41};
 assert.throws(()=>reconcile({...s,entries:[{...s,folio:1,status:'issued',amount:100,exemptAmount:0}]}),/EXEMPT_TOTAL_MISMATCH/);
});
test('rejects malformed date and unknown state',()=>{
 assert.throws(()=>reconcile({...scope,day:'2026-02-30',entries:[]}),/INVALID_DAY/);
 assert.throws(()=>reconcile({...scope,entries:[{...issued(1,100),status:'credited'}]}),/INVALID_STATUS/);
});
