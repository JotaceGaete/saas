import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {runPointFiscalOutboxBatch}=require('./point-fiscal-outbox-runner.cjs');
test('runner does not call fiscal preparation when queue is empty',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:[],error:null}}};
 const result=await runPointFiscalOutboxBatch({db,limit:2});
 assert.deepEqual(result,{claimed:0,results:[],emissionEnabled:false});
 assert.deepEqual(calls,[['crm_claim_point_fiscal_pilot',{p_limit:2}]]);
});
test('invalid limits are rejected before querying database',async()=>{
 const db={rpc:()=>{throw new Error('should not be called')}};
 for(const limit of [0,-1,21,1.5,'5']){
  await assert.rejects(runPointFiscalOutboxBatch({db,limit}),/INVALID_WORKER_CONFIGURATION/);
 }
});
test('claim errors abort without falsely acknowledging tasks',async()=>{
 const db={rpc:async()=>({data:null,error:{message:'database unavailable'}})};
 await assert.rejects(runPointFiscalOutboxBatch({db}),/OUTBOX_CLAIM_FAILED/);
});
test('blocked tasks are marked blocked and do not emit',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{
  calls.push([name,args]);
  if(name==='crm_claim_point_fiscal_pilot')return {data:[{id:'q1',business_id:'other',sale_id:'s1',point_operation_id:'op1'}],error:null};
  return {data:true,error:null};
 }};
 const result=await runPointFiscalOutboxBatch({db});
 assert.deepEqual(result.results,[{id:'q1',status:'blocked'}]);
 assert.equal(result.emissionEnabled,false);
 assert.equal(calls[1][0],'crm_complete_point_fiscal_pilot');
 assert.equal(calls[1][1].p_status,'blocked');
});
test('failed completion remains unconfirmed for operator review',async()=>{
 const db={rpc:async(name)=>name==='crm_claim_point_fiscal_pilot'
  ?{data:[{id:'q1',business_id:'other',sale_id:'s1',point_operation_id:'op1'}],error:null}
  :{data:false,error:null}};
 const result=await runPointFiscalOutboxBatch({db});
 assert.deepEqual(result.results,[{id:'q1',status:'completion_unconfirmed'}]);
});
