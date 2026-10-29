import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {prepareFinalizedPointFiscal}=require('./point-finalized-fiscal.cjs');
const businessId='b1',saleId='s1';
const op={id:'op1',business_id:businessId,crm_invoice_id:saleId,mp_order_id:'456',mp_payment_id:'123',
 mp_status:'processed',amount:100,currency:'CLP',finalized_at:'2026-10-29T12:00:00Z'};
const pay={id:'p1',business_id:businessId,invoice_id:saleId,amount:100,currency:'CLP',
 payment_method:'mercado_pago',payment_status:'received',voided_at:null,reference:'Point 456'};
const sale={id:saleId,business_id:businessId,total:100,status:'pagada',paid_at:'2026-10-29T12:00:00Z'};
function setup({operation=op,payment=pay,mpStatus='approved'}={}){
 let prepares=0,lookups=0;
 const db={from(table){const q={select(){return q;},eq(){return q;},limit(){
  return Promise.resolve({data:table==='crm_pos_point_operations'?[operation]:[payment],error:null});
 }};return q;}};
 return {args:{db,businessId,saleId,loadSale:async()=>sale,getMerchantAccessToken:async()=> 'test-secret',
  prepareFiscal:async({operationKey})=>{prepares++;return {operationKey,status:'pending'};},
  fetchImpl:async()=>{lookups++;return {ok:true,json:async()=>({id:123,order:{id:456},status:mpStatus,transaction_amount:100})};}},
  counts:()=>({prepares,lookups})};
}
test('reconciles completed Point and prepares one fiscal operation without duplicate payment',async()=>{
 process.env.SII_POINT_PAYMENT_LOOKUP_CONTRACT_VERIFIED='true';
 const h=setup(),result=await prepareFinalizedPointFiscal(h.args);
 assert.equal(result.status,'prepared');assert.equal(result.emissionEnabled,false);
 assert.deepEqual(h.counts(),{prepares:1,lookups:1});
 delete process.env.SII_POINT_PAYMENT_LOOKUP_CONTRACT_VERIFIED;
});
test('pending Point, rejected MP and wrong CRM reference cannot prepare',async()=>{
 process.env.SII_POINT_PAYMENT_LOOKUP_CONTRACT_VERIFIED='true';
 for(const options of [
  {operation:{...op,mp_status:'pending'}},{mpStatus:'rejected'},
  {payment:{...pay,reference:'Point other'}},{payment:{...pay,voided_at:'2026-10-29'}}
 ]) {
  const h=setup(options),result=await prepareFinalizedPointFiscal(h.args);
  assert.equal(result.status,'blocked');assert.equal(h.counts().prepares,0);
 }
 delete process.env.SII_POINT_PAYMENT_LOOKUP_CONTRACT_VERIFIED;
});

test('real Point contract remains blocked by default even after CRM finalization',async()=>{
 delete process.env.SII_POINT_PAYMENT_LOOKUP_CONTRACT_VERIFIED;
 const h=setup();const result=await prepareFinalizedPointFiscal(h.args);
 assert.equal(result.reason,'POINT_PROVIDER_CONTRACT_UNVERIFIED');
 assert.deepEqual(h.counts(),{prepares:0,lookups:0});
});
