import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { issueReserved } from './issuance-orchestrator.mjs';

function harness({submitResult,submitError,crashAt}={}) {
 const db={state:'reserved',folio:701,trackId:null,artifact:null,sendCount:0,events:[]};
 const xmlBytes=Buffer.from('<signed-test-document/>');
 const deps={
  async load(){return {state:db.state,folio:db.folio,documentType:39};},
  async sign(){return {xmlBytes,sha256:createHash('sha256').update(xmlBytes).digest('hex')};},
  async validate(){return true;},
  async store(id,doc){
   if(db.artifact && db.artifact.sha256!==doc.sha256) throw Error('immutable conflict');
   db.artifact ??= {sha256:doc.sha256};
   db.events.push('stored');
  },
  async transition(id,expected,next,trackId){
   // Synchronous compare-and-swap models an atomic DB update, but is NOT
   // a substitute for real PostgreSQL concurrent transaction tests.
   if(db.state!==expected) return false;
   if(next==='signed'&&!db.artifact) return false;
   db.state=next;db.events.push(next);
   if(trackId) db.trackId=trackId;
   if(crashAt===next) throw Error('simulated process interruption');
   return true;
  },
  async submit(){
   db.sendCount++;db.events.push('send');
   if(submitError) throw submitError;
   return submitResult ?? {confirmed:true,trackId:'track701'};
  }
 };
 return {db,deps};
}
test('two workers, same operation: at most one send',async()=>{
 const {db,deps}=harness();
 const outcomes=await Promise.allSettled([
  issueReserved({id:'op701',deps}),issueReserved({id:'op701',deps})
 ]);
 assert.equal(db.sendCount,1);
 assert.equal(db.state,'submitted');
 assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
});
test('timeout after SII receives: no second send on retry',async()=>{
 const {db,deps}=harness({submitError:new Error('timeout after remote receive')});
 const first=await issueReserved({id:'op701',deps});
 assert.equal(first.status,'reconcile_required');
 assert.equal(db.state,'unknown');
 const retry=await issueReserved({id:'op701',deps});
 assert.equal(retry.status,'reconcile_required');
 assert.equal(db.sendCount,1);
 assert.equal(db.folio,701);
});
test('SII unconfirmed response: require reconciliation',async()=>{
 const {db,deps}=harness({submitResult:{confirmed:false}});
 assert.equal((await issueReserved({id:'op701',deps})).status,'reconcile_required');
 assert.equal(db.state,'unknown');
 assert.equal(db.sendCount,1);
});
test('crash after durable submitting: recovery never resends',async()=>{
 const {db,deps}=harness({crashAt:'submitting'});
 await assert.rejects(()=>issueReserved({id:'op701',deps}));
 assert.equal(db.state,'submitting');
 assert.equal(db.sendCount,0);
 assert.equal((await issueReserved({id:'op701',deps})).status,'reconcile_required');
 assert.equal(db.sendCount,0);
});
test('crash after signed: recovery requires manual reconciliation',async()=>{
 const {db,deps}=harness({crashAt:'signed'});
 await assert.rejects(()=>issueReserved({id:'op701',deps}));
 assert.equal(db.state,'signed');
 assert.equal(db.sendCount,0);
 assert.equal((await issueReserved({id:'op701',deps})).status,'reconcile_required');
});
test('crash after acknowledged send: retry does not resend',async()=>{
 const {db,deps}=harness({crashAt:'submitted'});
 await assert.rejects(()=>issueReserved({id:'op701',deps}));
 assert.equal(db.state,'submitted');
 assert.equal(db.sendCount,1);
 assert.equal((await issueReserved({id:'op701',deps})).status,'reconcile_required');
 assert.equal(db.sendCount,1);
});
