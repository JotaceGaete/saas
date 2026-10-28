import { test } from 'node:test';
import assert from 'node:assert/strict';
import { issueReserved } from './issuance-orchestrator.mjs';
function setup(submit=async()=>({confirmed:true,trackId:'track1'})) {
 const calls=[];
 const deps={
  load:async()=>({state:'reserved',folio:25,documentType:39}),
  sign:async()=>({xmlBytes:Buffer.from('<signed/>'),sha256:'a'.repeat(64)}),
  validate:async()=>true,
  store:async()=>calls.push('store'),
  transition:async(id,from,to)=>calls.push(to),
  submit:async(...args)=>{calls.push('send');return submit(...args);}
 };
 return {deps,calls};
}
test('durably marks submitting before network call',async()=>{
 const {deps,calls}=setup();
 assert.equal((await issueReserved({id:'op1',deps})).status,'submitted');
 assert.deepEqual(calls,['store','signed','submitting','send','submitted']);
});
test('unknown network outcome never creates another folio',async()=>{
 const {deps,calls}=setup(async()=>{throw Error('timeout')});
 const r=await issueReserved({id:'op1',deps});
 assert.equal(r.status,'reconcile_required');assert.equal(r.folio,25);
 assert.deepEqual(calls,['store','signed','submitting','send','unknown']);
});
test('previously submitted operation cannot be resent',async()=>{
 const {deps,calls}=setup();deps.load=async()=>({state:'unknown',folio:25,documentType:39});
 assert.equal((await issueReserved({id:'op1',deps})).status,'reconcile_required');
 assert.deepEqual(calls,[]);
});
test('invalid signature validation blocks submission',async()=>{
 const {deps,calls}=setup();deps.validate=async()=>false;
 await assert.rejects(()=>issueReserved({id:'op1',deps}));
 assert.deepEqual(calls,[]);
});
