import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {processPointFiscalOutboxItem,PILOT}=require('./point-fiscal-outbox-worker.cjs');
const saleId='s1';
const operation={id:'op1',business_id:PILOT,crm_invoice_id:saleId,mp_order_id:'o1',
 mp_payment_id:'123',external_reference:'ref1',mp_status:'processed',finalized_at:'2026-10-29',
 amount:100,currency:'CLP'};
const payment={id:'p1',business_id:PILOT,invoice_id:saleId,amount:100,currency:'CLP',
 payment_method:'mercado_pago',payment_status:'received',voided_at:null,reference:'Point o1'};
function deps(){
 let calls=0;
 const db={from(table){const q={select(){return q},eq(){return q},limit(){return Promise.resolve({
 data:table==='crm_pos_point_operations'?[operation]:[payment],error:null})}};return q}};
 return {db,loadSale:async()=>({id:saleId,business_id:PILOT,total:100,status:'pagada',paid_at:'2026-10-29'}),
  getMerchantAccessToken:async()=> 'token',
  prepareFiscal:async({operationKey})=>{calls++;return {operationKey,status:'pending'}},
  fetchImpl:async()=>({ok:true,json:async()=>({id:'o1',external_reference:'ref1',status:'processed',
   transactions:{payments:[{id:'123',status:'approved',amount:'100'}]}})}),
  count:()=>calls};
}
test('pilot pending task prepares fiscal operation without emission',async()=>{
 const d=deps(),r=await processPointFiscalOutboxItem({
 item:{business_id:PILOT,sale_id:saleId,point_operation_id:'op1',status:'pending'},...d});
 assert.equal(r.status,'prepared');assert.equal(r.emissionEnabled,false);assert.equal(d.count(),1);
});
test('wrong merchant and nonpending tasks are ignored without any fiscal call',async()=>{
 for(const item of [{business_id:'other',sale_id:saleId,point_operation_id:'op1',status:'pending'},
  {business_id:PILOT,sale_id:saleId,point_operation_id:'op1',status:'prepared'}]){
  const d=deps(),r=await processPointFiscalOutboxItem({item,...d});
  assert.equal(r.status,'blocked');assert.equal(d.count(),0);
 }
});
