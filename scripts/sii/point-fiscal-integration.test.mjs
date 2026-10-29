import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {prepareFiscalAfterPointApproval}=require('./point-fiscal-integration.cjs');
const businessId='b1',saleId='s1',pointPaymentId='123';
const sale={id:saleId,business_id:businessId,total:100,status:'pagada',paid_at:'2026-10-29T12:00:00Z'};
function make(overrides={}){
 let linked=false,records=0,prepares=0,lookups=0;
 const args={businessId,saleId,pointPaymentId,loadSale:async()=>sale,
  loadPointOrderBinding:async()=>({businessId,saleId,orderId:'456',paymentId:'123'}),
  getMerchantAccessToken:async()=> 'test-token',
  isPaymentLinked:async()=>linked,recordPayment:async()=>{records++;linked=true;},
  prepareFiscal:async({operationKey})=>{prepares++;return {operationKey,status:'pending'};},
  fetchImpl:async()=>{lookups++;return {ok:true,json:async()=>({
   id:123,order:{id:456},status:'approved',transaction_amount:100
  })};},...overrides};
 return {args,counts:()=>({linked,records,prepares,lookups})};
}
test('trusted Point approval records payment then prepares fiscal once without emission',async()=>{
 const h=make(),result=await prepareFiscalAfterPointApproval(h.args);
 assert.equal(result.status,'prepared');assert.equal(result.emissionEnabled,false);
 assert.deepEqual(h.counts(),{linked:true,records:1,prepares:1,lookups:1});
});
test('unbound Point order blocks before provider lookup and payment recording',async()=>{
 const h=make({loadPointOrderBinding:async()=>({businessId,saleId,orderId:'456',paymentId:'999'})});
 const result=await prepareFiscalAfterPointApproval(h.args);
 assert.equal(result.status,'blocked');assert.equal(result.reason,'RECONCILIATION_REQUIRED');
 assert.deepEqual(h.counts(),{linked:false,records:0,prepares:0,lookups:0});
});
test('rejected Point payment does not record or prepare',async()=>{
 const h=make({fetchImpl:async()=>({ok:true,json:async()=>({
  id:123,order:{id:456},status:'rejected',transaction_amount:100
 })})});
 const result=await prepareFiscalAfterPointApproval(h.args);
 assert.equal(result.status,'blocked');assert.equal(h.counts().records,0);assert.equal(h.counts().prepares,0);
});
