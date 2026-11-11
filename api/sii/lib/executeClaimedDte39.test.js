import {describe,it,expect,vi} from 'vitest';
import {executeClaimedDte39 as execute} from './executeClaimedDte39.js';
const sample=()=>({
 job:{id:'job1',document_type:39,state:'claimed',business_id:'shop-a',operation_id:'op-a'},
 control:{enabled:true,payment_voucher_policy_approved:true},
 issuer:{business_id:'shop-a',enabled:true,verified:true},
 credentials:{business_id:'shop-a',apiKey:'key',baseUrl:'https://tenant.example.cl'},
 sale:{operationId:'op-a',rutOperador:'77804207-K',fechaEmision:'2026-10-30',
 paymentCode:'EF',total:1000,amountTendered:1000,
 items:[{description:'Producto',unitPrice:1000,quantity:1,subtotal:1000,isExempt:false}]}
});
describe('one-shot claimed DTE39 dispatch',()=>{
 it('never calls provider when fiscal gate is closed',async()=>{
  const input=sample();input.control.enabled=false;const emit=vi.fn();
  const result=await execute({...input,emit});
  expect(emit).not.toHaveBeenCalled();
  expect(result).toMatchObject({phase:'preflight',finish:{p_state:'failed',p_error:'FISCAL_DISPATCH_DISABLED'}});
 });
 it('never calls provider for a different tenant',async()=>{
  const input=sample();input.credentials.business_id='shop-b';const emit=vi.fn();
  const result=await execute({...input,emit});
  expect(emit).not.toHaveBeenCalled();
  expect(result.finish.p_state).toBe('failed');
 });
 it('never calls provider when operation IDs differ',async()=>{
  const input=sample();input.sale.operationId='different';const emit=vi.fn();
  const result=await execute({...input,emit});
  expect(emit).not.toHaveBeenCalled();
  expect(result.finish.p_error).toBe('OPERATION_ID_MISMATCH');
 });
 it('records issued only with a real valid folio',async()=>{
  const emit=vi.fn().mockResolvedValue({folio:123,isSimulation:false});
  const result=await execute({...sample(),emit});
  expect(emit).toHaveBeenCalledOnce();
  expect(result.finish).toMatchObject({p_state:'issued',p_folio:123});
 });
 it('does not mark a simulation as issued',async()=>{
  const result=await execute({...sample(),emit:vi.fn().mockResolvedValue({folio:123,isSimulation:true})});
  expect(result.finish).toMatchObject({p_state:'unknown',p_error:'SIMULATION_NOT_ISSUED'});
 });
 it('marks provider timeouts unknown without retry',async()=>{
  const emit=vi.fn().mockRejectedValue(new Error('network timeout'));
  const result=await execute({...sample(),emit});
  expect(emit).toHaveBeenCalledOnce();
  expect(result.finish).toMatchObject({p_state:'unknown',p_error:'PROVIDER_OUTCOME_UNCERTAIN'});
 });
});
