import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {normalizePointPayment}=require('./point-provider-verification.cjs');
const providerPayment={id:123,status:'approved',transaction_amount:100,order:{id:456}};
const args={providerPayment,businessId:'b1',saleId:'s1',pointPaymentId:'123',expectedOrderId:'456'};
test('normalizes approved Point payment with server-trusted order binding',()=>{
 assert.deepEqual(normalizePointPayment(args),{id:'123',order_id:'456',business_id:'b1',sale_id:'s1',
 source:'mercado_pago_point',verifiedByServer:true,status:'approved',amount:100});
});
test('refuses mismatched payment, order and invalid amount',()=>{
 for(const changed of [
  {pointPaymentId:'124'},{expectedOrderId:'999'},
  {providerPayment:{...providerPayment,transaction_amount:100.5}},
  {providerPayment:{...providerPayment,transaction_amount:-1}},
  {providerPayment:{...providerPayment,order:null}},
 ]) assert.equal(normalizePointPayment({...args,...changed}),null);
});
test('rejected payment is normalized but not approved',()=>{
 assert.equal(normalizePointPayment({...args,providerPayment:{...providerPayment,status:'rejected'}}).status,'rejected');
});
