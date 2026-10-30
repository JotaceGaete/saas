import {describe,it,expect,vi} from 'vitest';
import {processClaimedDte39 as process} from './processClaimedDte39.js';
const fixture=()=>{
 const rpc=vi.fn().mockResolvedValue({data:true,error:null});
 return {db:{rpc},snapshot:{
  job:{id:'j',document_type:39,state:'claimed',business_id:'a',invoice_id:'i',operation_id:'op'},
  invoice:{id:'i',business_id:'a',source:'pos',status:'pagada',paid_at:'2026-10-30T12:00:00Z',issue_date:'2026-10-30',total:1000},
  business:{country_code:'CL'},
  issuer:{business_id:'a',issuer_rut:'77804207-K',enabled:true,verified:true},
  taxConfig:{default_is_exempt:false,confirmed_by_owner:true},
  items:[{name:'Producto',unit_price:1000,quantity:1,subtotal:1000}],
  payments:[{payment_method:'cash',payment_status:'received',amount:1000,voided_at:null}]
 },control:{enabled:true,payment_voucher_policy_approved:true},
 credentials:{business_id:'a',apiKey:'secret',baseUrl:'https://tenant.example.cl'}};
};
describe('claimed fiscal job persistence',()=>{
 it('persists a confirmed folio once',async()=>{
  const input=fixture(),emit=vi.fn().mockResolvedValue({folio:12,isSimulation:false});
  const result=await process({...input,emit});
  expect(result).toEqual({jobId:'j',state:'issued',folio:12});
  expect(emit).toHaveBeenCalledOnce();
  expect(input.db.rpc).toHaveBeenCalledWith('sii_pos_dte39_finish',expect.objectContaining({p_state:'issued',p_folio:12}));
 });
 it('never emits when voucher is card',async()=>{
  const input=fixture(),emit=vi.fn();
  input.snapshot.payments[0].payment_method='mercado_pago';
  const result=await process({...input,emit});
  expect(result.state).toBe('failed');
  expect(emit).not.toHaveBeenCalled();
 });
 it('persists uncertain outcomes without retry',async()=>{
  const input=fixture(),emit=vi.fn().mockRejectedValue(new Error('timeout'));
  const result=await process({...input,emit});
  expect(result.state).toBe('unknown');
  expect(emit).toHaveBeenCalledOnce();
  expect(input.db.rpc).toHaveBeenCalledWith('sii_pos_dte39_finish',expect.objectContaining({p_state:'unknown'}));
 });
 it('does not retry if the finish RPC fails',async()=>{
  const input=fixture(),emit=vi.fn().mockResolvedValue({folio:12,isSimulation:false});
  input.db.rpc.mockResolvedValue({data:null,error:new Error('db unavailable')});
  await expect(process({...input,emit})).rejects.toThrow('db unavailable');
  expect(emit).toHaveBeenCalledOnce();
 });
 it('never sends credentials to the finish RPC',async()=>{
  const input=fixture();
  await process({...input,emit:vi.fn().mockResolvedValue({folio:12,isSimulation:false})});
  expect(JSON.stringify(input.db.rpc.mock.calls)).not.toContain('secret');
 });
});
