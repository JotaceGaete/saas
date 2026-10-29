import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {loadWalinkaPointBinding,isWalinkaPointPaymentLinked}=require('./point-walinka-ledger-adapter.cjs');
function db(rows, payments=[]){
 return {from(table){
  const data=table==='crm_pos_point_operations'?rows:payments;
  const q={select(){return q;},eq(){return q;},limit(){return Promise.resolve({data,error:null});}};
  return q;
 }};
}
const row={id:'op1',business_id:'b1',crm_invoice_id:'s1',mp_order_id:'o1',mp_payment_id:'123',mp_status:'approved',amount:100,currency:'CLP'};
test('loads Point order and payment IDs from Walinka operation',async()=>{
 const r=await loadWalinkaPointBinding({db:db([row]),businessId:'b1',saleId:'s1'});
 assert.equal(r.orderId,'o1');assert.equal(r.paymentId,'123');
});
test('missing, ambiguous and cross-tenant bindings are rejected',async()=>{
 for(const rows of [[],[row,row],[{...row,business_id:'b2'}]])
 await assert.rejects(loadWalinkaPointBinding({db:db(rows),businessId:'b1',saleId:'s1'}));
});
test('CRM payment link remains unverified until durable mapping exists',async()=>{
 const result=await isWalinkaPointPaymentLinked({db:db([row],[{id:'p1'}]),businessId:'b1',saleId:'s1',pointPaymentId:'123'});
 assert.equal(result,false);
});
