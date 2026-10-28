import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reserveWithContentionRetry } from './caf-retry.mjs';
const locked = () => Object.assign(new Error('CAF range temporarily locked'), {code:'55P03'});
test('retries only lock contention, preserving idempotent reserve callback',async()=>{
 let calls=0;const delays=[];
 const result=await reserveWithContentionRetry({
  reserve:async()=>{calls++;if(calls<3)throw locked();return {folio:123};},
  sleep:async ms=>delays.push(ms),jitter:()=>0
 });
 assert.deepEqual(result,{folio:123});assert.equal(calls,3);assert.deepEqual(delays,[50,100]);
});
test('bounded contention returns temporary status, no folio invented',async()=>{
 let calls=0;
 const result=await reserveWithContentionRetry({
  reserve:async()=>{calls++;throw locked();},sleep:async()=>{},jitter:()=>0
 });
 assert.deepEqual(result,{status:'temporarily_unavailable',reason:'caf_locked'});assert.equal(calls,3);
});
test('no available folios is terminal, not retried',async()=>{
 let calls=0;const err=Object.assign(new Error('No active CAF folios available'),{code:'P0001'});
 await assert.rejects(()=>reserveWithContentionRetry({
  reserve:async()=>{calls++;throw err;},sleep:async()=>{}
 }),e=>e===err);assert.equal(calls,1);
});
test('unknown DB error is not retried',async()=>{
 let calls=0;
 await assert.rejects(()=>reserveWithContentionRetry({
  reserve:async()=>{calls++;throw Object.assign(new Error('denied'),{code:'42501'});},
  sleep:async()=>{}
 }),/denied/);assert.equal(calls,1);
});
test('rejects unbounded retry budget',async()=>{
 await assert.rejects(()=>reserveWithContentionRetry({
  reserve:async()=>({}),sleep:async()=>{},maxAttempts:100
 }),/Invalid retry budget/);
});
