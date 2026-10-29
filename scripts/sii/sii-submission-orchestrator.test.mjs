import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {submitPreparedBoleta}=require('./sii-submission-orchestrator.cjs');
const id='7afcfb5c-c88d-4f1b-9e9c-2cb86b92c3be', key='business:sale:39';
const payload={idBoletaOperacion:key};
const db={rpc:async(_,p)=>({data:{operationId:id,status:p.p_result,folio:p.p_folio}})};
test('claim failure prevents any provider call',async()=>{
 let sent=0;
 await assert.rejects(()=>submitPreparedBoleta({db,operationId:id,payload,apiKey:'test',providerContractVerified:true,
   beginSubmission:async()=>({operationId:id,status:'pending',operationKey:key,emissionAuthorized:false}),
   emit:async()=>{sent++;}}),/NOT_AUTHORIZED/);
 assert.equal(sent,0);
});
test('one claimed operation sends exactly once and records submitted',async()=>{
 let sent=0;
 const result=await submitPreparedBoleta({db,operationId:id,payload,apiKey:'test',providerContractVerified:true,
   beginSubmission:async()=>({operationId:id,status:'submitting',operationKey:key,emissionAuthorized:true}),
   emit:async()=>{sent++;return {status:'submitted',response:{success:true,folio:51105}};}});
 assert.equal(sent,1);assert.equal(result.status,'submitted');assert.equal(result.ledger.folio,51105);
});
test('timeout is frozen unknown and never retried',async()=>{
 let sent=0;
 const result=await submitPreparedBoleta({db,operationId:id,payload,apiKey:'test',providerContractVerified:true,
   beginSubmission:async()=>({operationId:id,status:'submitting',operationKey:key,emissionAuthorized:true}),
   emit:async()=>{sent++;throw Error('timeout');}});
 assert.equal(sent,1);assert.equal(result.status,'unknown');
});
test('duplicate result stays unknown for manual reconciliation',async()=>{
 const result=await submitPreparedBoleta({db,operationId:id,payload,apiKey:'test',providerContractVerified:true,
   beginSubmission:async()=>({operationId:id,status:'submitting',operationKey:key,emissionAuthorized:true}),
   emit:async()=>({status:'already_issued',folio:51104,response:{folioExistente:51104}})});
 assert.equal(result.status,'unknown');assert.equal(result.ledger.folio,51104);
});

test('unverified provider folio/idempotency contract blocks claim and emission',async()=>{
 let claims=0, sends=0;
 await assert.rejects(()=>submitPreparedBoleta({db,operationId:id,payload,apiKey:'test',
  beginSubmission:async()=>{claims++;return {operationId:id,status:'submitting',operationKey:key,emissionAuthorized:true};},
  emit:async()=>{sends++;return {status:'submitted',response:{success:true}};}
 }),/PROVIDER_CONTRACT_NOT_VERIFIED/);
 assert.equal(claims,0);assert.equal(sends,0);
});
