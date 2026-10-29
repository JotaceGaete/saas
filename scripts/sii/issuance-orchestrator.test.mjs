import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { issueReserved } from './issuance-orchestrator.mjs';
function setup({ submit=async()=>({confirmed:true,trackId:'track1'}), valid=true, casResult=true }={}) {
 const calls=[], xmlBytes=Buffer.from('<signed/>');
 const deps={
  load:async()=>({state:'reserved',folio:25,documentType:39}),
  sign:async()=>({xmlBytes,sha256:valid?createHash('sha256').update(xmlBytes).digest('hex'):'a'.repeat(64)}),
  validate:async()=>true,
  store:async()=>{calls.push('store');},
  transition:async(id,from,to)=>{calls.push(to);return casResult;},
  submit:async(...args)=>{calls.push('send');return submit(...args);}
 };
 return {deps,calls};
}
test('commits submitting before network call',async()=>{
 const {deps,calls}=setup();
 assert.equal((await issueReserved({id:'op1',deps})).status,'submitted');
 assert.deepEqual(calls,['store','signed','submitting','send','submitted']);
});
test('timeout preserves folio and requires reconciliation',async()=>{
 const {deps,calls}=setup({submit:async()=>{throw Error('timeout')}});
 const r=await issueReserved({id:'op1',deps});
 assert.equal(r.status,'reconcile_required');assert.equal(r.folio,25);
 assert.deepEqual(calls,['store','signed','submitting','send','unknown']);
});
test('unknown state never resends',async()=>{
 const {deps,calls}=setup();deps.load=async()=>({state:'unknown',folio:25,documentType:39});
 assert.equal((await issueReserved({id:'op1',deps})).status,'reconcile_required');
 assert.deepEqual(calls,[]);
});
test('wrong digest blocks storage and submission',async()=>{
 const {deps,calls}=setup({valid:false});
 await assert.rejects(()=>issueReserved({id:'op1',deps}),/SHA-256 mismatch/);
 assert.deepEqual(calls,[]);
});
test('failed atomic CAS blocks network call',async()=>{
 const {deps,calls}=setup({casResult:false});
 await assert.rejects(()=>issueReserved({id:'op1',deps}),/atomically committed/);
 assert.deepEqual(calls,['store','signed']);
});
test('failed signature validation blocks submission',async()=>{
 const {deps,calls}=setup();deps.validate=async()=>false;
 await assert.rejects(()=>issueReserved({id:'op1',deps}));
 assert.deepEqual(calls,[]);
});
