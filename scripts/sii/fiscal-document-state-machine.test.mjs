import test from 'node:test';
import assert from 'node:assert/strict';
import {transitionFiscalDocument as move} from './fiscal-document-state-machine.mjs';
const doc={id:'doc-1',businessId:'biz-1',status:'draft'};
const base={actor:'backend-worker',at:'2026-10-28T12:00:00Z'};
test('requires each intermediate state and its evidence',()=>{
 const a=move({document:doc,event:{to:'pending_signature'},...base});
 const b=move({document:a.document,event:{to:'signed'},evidence:{signatureDigest:'sha256:test'},...base});
 const c=move({document:b.document,event:{to:'submitted'},evidence:{submissionId:'test-track'},...base});
 const d=move({document:c.document,event:{to:'accepted'},evidence:{siiReceiptId:'test-receipt'},...base});
 assert.equal(d.document.status,'accepted');assert.equal(d.audit.from,'submitted');
 assert.equal(d.transmittable,false);assert.ok(Object.isFrozen(d.audit));
});
test('cannot accept drafts or change accepted documents',()=>{
 assert.throws(()=>move({document:doc,event:{to:'accepted'},...base}),/FORBIDDEN_TRANSITION/);
 assert.throws(()=>move({document:{...doc,status:'accepted'},event:{to:'draft'},...base}),/FORBIDDEN_TRANSITION/);
});
test('signed, submitted and accepted require evidence',()=>{
 for(const [status,to] of [['pending_signature','signed'],['signed','submitted'],['submitted','accepted']])
  assert.throws(()=>move({document:{...doc,status},event:{to},...base}),/EVIDENCE_REQUIRED/);
});
test('audit records actor, document and tenant',()=>{
 const result=move({document:doc,event:{to:'pending_signature'},...base});
 assert.equal(result.audit.businessId,'biz-1');assert.equal(result.audit.documentId,'doc-1');
 assert.equal(result.audit.actor,'backend-worker');
});
test('rejects invalid timestamp or missing actor',()=>{
 assert.throws(()=>move({document:doc,event:{to:'pending_signature'},actor:'',at:base.at}),/ACTOR_REQUIRED/);
 assert.throws(()=>move({document:doc,event:{to:'pending_signature'},actor:'worker',at:'yesterday'}),/INVALID_TIMESTAMP/);
});
