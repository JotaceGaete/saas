import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {recordProviderResult,recordUncertainResult}=require('./sii-fiscal-ledger-bridge.cjs');
const id='7afcfb5c-c88d-4f1b-9e9c-2cb86b92c3be';
test('successful provider submission is recorded as submitted, never accepted',async()=>{
 let args;
 const db={rpc:async(name,payload)=>{args={name,payload};return {data:{operationId:id,status:'submitted',folio:51105},error:null}}};
 const result=await recordProviderResult({db,operationId:id,providerResult:{status:'submitted',response:{success:true,folio:51105}}});
 assert.equal(args.name,'sii_pilot_record_provider_result');
 assert.equal(args.payload.p_result,'submitted');
 assert.equal(args.payload.p_folio,51105);
 assert.equal(result.status,'submitted');
});
test('duplicate folio is frozen for reconciliation',async()=>{
 let args;
 const db={rpc:async(_,payload)=>{args=payload;return {data:{operationId:id,status:'unknown',folio:51104}}}};
 await recordProviderResult({db,operationId:id,providerResult:{status:'already_issued',folio:51104}});
 assert.equal(args.p_result,'unknown');
 assert.equal(args.p_folio,51104);
});
test('network uncertainty is recorded without contacting provider',async()=>{
 let count=0;
 const db={rpc:async(_,payload)=>{count++;assert.equal(payload.p_result,'unknown');return {data:{operationId:id,status:'unknown'}}}};
 await recordUncertainResult({db,operationId:id});
 assert.equal(count,1);
});
test('ledger failures stop processing',async()=>{
 const db={rpc:async()=>({error:{message:'denied'},data:null})};
 await assert.rejects(()=>recordProviderResult({db,operationId:id,providerResult:{status:'submitted',response:{success:true}}}),/manual reconciliation/);
});
