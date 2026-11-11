import {describe,it,expect,vi} from 'vitest';
import {recordDte39PreflightFailure} from './recordDte39PreflightFailure.js';
const job={id:'job-1',state:'claimed',document_type:39};
describe('persist local fiscal rejection',()=>{
 it('writes only failed state through RPC',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:true,error:null});
  const result=await recordDte39PreflightFailure({db:{rpc},job,error:new Error('ISSUER_NOT_VERIFIED')});
  expect(rpc).toHaveBeenCalledWith('sii_pos_dte39_finish',{p_job_id:'job-1',p_state:'failed',p_folio:null,p_response:null,p_error:'ISSUER_NOT_VERIFIED'});
  expect(result.state).toBe('failed');
 });
 it('rejects missing claim without database mutation',async()=>{
  const rpc=vi.fn();
  await expect(recordDte39PreflightFailure({db:{rpc},job:{...job,state:'pending'},error:new Error('INVALID_TOTAL')})).rejects.toThrow('CLAIMED_JOB_REQUIRED');
  expect(rpc).not.toHaveBeenCalled();
 });
 it('rejects concurrent completion',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:false,error:null});
  await expect(recordDte39PreflightFailure({db:{rpc},job,error:new Error('INVALID_TOTAL')})).rejects.toThrow('FISCAL_JOB_NOT_CLAIMED');
 });
 it('propagates database errors',async()=>{
  const rpc=vi.fn().mockResolvedValue({data:null,error:new Error('DB_ERROR')});
  await expect(recordDte39PreflightFailure({db:{rpc},job,error:new Error('INVALID_TOTAL')})).rejects.toThrow('DB_ERROR');
 });
});
