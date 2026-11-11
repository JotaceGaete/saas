import {describe,it,expect,vi} from 'vitest';
import {runNextDte39Job as run} from './runNextDte39Job.js';
const claim={jobId:'j1',businessId:'shop-a',operationId:'op-a',documentType:39};
const snapshot={job:{id:'j1',business_id:'shop-a',operation_id:'op-a',state:'claimed'}};
const setup=()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:claim,error:null})
  .mockResolvedValueOnce({data:snapshot,error:null});
 const loadControl=vi.fn().mockResolvedValue({enabled:false});
 const loadCredentials=vi.fn().mockResolvedValue({business_id:'shop-a'});
 const process=vi.fn().mockResolvedValue({jobId:'j1',state:'failed',folio:null});
 return {db:{rpc},loadControl,loadCredentials,process};
};
describe('DTE39 queue orchestrator',()=>{
 it('does not process when the queue is empty',async()=>{
  const input=setup();input.db.rpc.mockReset().mockResolvedValue({data:null,error:null});
  expect(await run(input)).toEqual({status:'idle'});
  expect(input.process).not.toHaveBeenCalled();
 });
 it('processes one claimed job with server-only tenant credentials',async()=>{
  const input=setup();
  expect(await run(input)).toMatchObject({status:'processed',jobId:'j1'});
  expect(input.db.rpc).toHaveBeenNthCalledWith(1,'sii_pos_dte39_claim_next');
  expect(input.db.rpc).toHaveBeenNthCalledWith(2,'sii_pos_dte39_job_snapshot',{p_job_id:'j1'});
  expect(input.loadCredentials).toHaveBeenCalledWith('shop-a');
  expect(input.process).toHaveBeenCalledOnce();
 });
 it('blocks a mismatched tenant snapshot',async()=>{
  const input=setup();input.db.rpc.mockReset()
   .mockResolvedValueOnce({data:claim,error:null})
   .mockResolvedValueOnce({data:{job:{...snapshot.job,business_id:'shop-b'}},error:null});
  expect(await run(input)).toMatchObject({status:'requires_review',reason:'FISCAL_SNAPSHOT_MISMATCH'});
  expect(input.loadCredentials).not.toHaveBeenCalled();
  expect(input.process).not.toHaveBeenCalled();
 });
 it('never emits when snapshot read fails',async()=>{
  const input=setup();input.db.rpc.mockReset()
   .mockResolvedValueOnce({data:claim,error:null})
   .mockResolvedValueOnce({data:null,error:new Error('database unavailable')});
  expect(await run(input)).toMatchObject({status:'requires_review',jobId:'j1'});
  expect(input.process).not.toHaveBeenCalled();
 });
 it('requires review rather than requeue when persistence fails',async()=>{
  const input=setup();input.process.mockRejectedValue(new Error('FISCAL_FINISH_NOT_PERSISTED'));
  expect(await run(input)).toMatchObject({status:'requires_review',reason:'FISCAL_FINISH_NOT_PERSISTED'});
  expect(input.db.rpc).toHaveBeenCalledTimes(2);
 });
 it('does not load credentials if claim itself fails',async()=>{
  const input=setup();input.db.rpc.mockReset().mockResolvedValue({data:null,error:new Error('claim unavailable')});
  await expect(run(input)).rejects.toThrow('claim unavailable');
  expect(input.loadCredentials).not.toHaveBeenCalled();
 });
});
