import {describe,it,expect,vi} from 'vitest';
import {recordVerifiedDte39Evidence as record} from './recordVerifiedDte39Evidence.js';
const job={id:'job-1',state:'unknown',operation_id:'op-1',invoice_id:'inv-1',business_id:'biz-1'};
const evidence={operationId:'op-1',source:'dtecore_verified',checkedBy:'admin',checkedAt:'2026-10-29T12:00:00Z',status:'issued',folio:100};
describe('verified fiscal evidence persistence',()=>{
 it('records provider evidence without emission',async()=>{
  const db={rpc:vi.fn().mockResolvedValue({data:'evidence-1',error:null})};
  const result=await record({db,job,evidence,reference:'provider-case-123'});
  expect(result).toMatchObject({evidenceId:'evidence-1',suggestedState:'issued'});
  expect(db.rpc).toHaveBeenCalledOnce();
  expect(db.rpc.mock.calls[0][0]).toBe('sii_pos_dte39_record_evidence');
 });
 it('does not write mismatched evidence',async()=>{
  const db={rpc:vi.fn()};
  await expect(record({db,job,evidence:{...evidence,operationId:'wrong'},reference:'ref'})).rejects.toThrow();
  expect(db.rpc).not.toHaveBeenCalled();
 });
 it('does not write missing reference',async()=>{
  const db={rpc:vi.fn()};
  await expect(record({db,job,evidence,reference:' '})).rejects.toThrow('EVIDENCE_REFERENCE_REQUIRED');
  expect(db.rpc).not.toHaveBeenCalled();
 });
 it('keeps not-found cases uncertain',async()=>{
  const db={rpc:vi.fn().mockResolvedValue({data:'evidence-2',error:null})};
  const result=await record({db,job,evidence:{...evidence,status:'not_found',folio:undefined},reference:'provider-check'});
  expect(result.suggestedState).toBe('unknown');
  expect(db.rpc.mock.calls[0][1].p_folio).toBeNull();
 });
 it('propagates database failures',async()=>{
  const db={rpc:vi.fn().mockResolvedValue({data:null,error:new Error('db failure')})};
  await expect(record({db,job,evidence,reference:'ref'})).rejects.toThrow('db failure');
 });
});
