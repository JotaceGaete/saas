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
const row={id:'op1',business_id:'b1',crm_invoice_id:'s1',mp_order_id:'o1',external_reference:'ref1',mp_payment_id:'123',mp_status:'processed',amount:100,currency:'CLP',finalized_at:'2026-10-29T12:00:00Z'};
test('loads Point order and payment IDs from Walinka operation',async()=>{
 const r=await loadWalinkaPointBinding({db:db([row]),businessId:'b1',saleId:'s1'});
 assert.equal(r.orderId,'o1');assert.equal(r.paymentId,'123');
});
test('missing, ambiguous and cross-tenant bindings are rejected',async()=>{
 for(const rows of [[],[row,row],[{...row,business_id:'b2'}]])
 await assert.rejects(loadWalinkaPointBinding({db:db(rows),businessId:'b1',saleId:'s1'}));
});
test('CRM payment link stays blocked for non-finalized Point operation',async()=>{
 const result=await isWalinkaPointPaymentLinked({db:db([row],[{id:'p1'}]),businessId:'b1',saleId:'s1',pointPaymentId:'123'});
 assert.equal(result,false);
});

test('reconciles finalized Point operation with exact CRM payment reference',async()=>{
 const op={...row,mp_status:'processed',finalized_at:'2026-10-29T12:00:00Z'};
 const pay={id:'p1',business_id:'b1',invoice_id:'s1',amount:100,currency:'CLP',
 payment_method:'mercado_pago',payment_status:'received',voided_at:null,reference:'Point o1'};
 assert.equal(await isWalinkaPointPaymentLinked({db:db([op],[pay]),businessId:'b1',saleId:'s1',pointPaymentId:'123'}),true);
 for(const wrong of [{reference:'Point wrong'},{amount:200},{voided_at:'2026-10-29'},{payment_status:'pending'}])
 assert.equal(await isWalinkaPointPaymentLinked({db:db([op],[{...pay,...wrong}]),businessId:'b1',saleId:'s1',pointPaymentId:'123'}),false);
});

test('Point binding rejects unfinalized operation and invalid amounts',async()=>{
 for(const bad of [{mp_status:'approved'},{finalized_at:null},{amount:0},{amount:1.25}])
 await assert.rejects(loadWalinkaPointBinding({db:db([{...row,...bad}]),businessId:'b1',saleId:'s1'}));
});

test('duplicate CRM payments for one Point order block fiscal reconciliation',async()=>{
 const pay={id:'p1',business_id:'b1',invoice_id:'s1',amount:100,currency:'CLP',
  payment_method:'mercado_pago',payment_status:'received',voided_at:null,reference:'Point o1'};
 assert.equal(await isWalinkaPointPaymentLinked({db:db([row],[pay,{...pay,id:'p2'}]),
  businessId:'b1',saleId:'s1',pointPaymentId:'123'}),false);
});
test('Point binding requires external reference for provider correlation',async()=>{
 await assert.rejects(loadWalinkaPointBinding({db:db([{...row,external_reference:null}]),businessId:'b1',saleId:'s1'}));
});
