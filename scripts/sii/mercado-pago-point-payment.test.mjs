import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fetchPointPayment}=require('./mercado-pago-point-payment.cjs');
const args={accessToken:'secret-test-token',pointPaymentId:'123',businessId:'b1',saleId:'s1',expectedOrderId:'456'};
test('looks up payment using server token and validates order binding',async()=>{
 let called=0;
 const payment=await fetchPointPayment({...args,fetchImpl:async(url,options)=>{
  called++;assert.equal(url,'https://api.mercadopago.com/v1/payments/123');
  assert.equal(options.headers.Authorization,'Bearer secret-test-token');
  return {ok:true,json:async()=>({id:123,order:{id:456},status:'approved',transaction_amount:100})};
 }});
 assert.equal(called,1);assert.equal(payment.status,'approved');assert.equal(payment.verifiedByServer,true);
});
test('refuses mismatched order, provider errors, invalid identifiers without emission',async()=>{
 await assert.rejects(fetchPointPayment({...args,fetchImpl:async()=>({
  ok:true,json:async()=>({id:123,order:{id:999},status:'approved',transaction_amount:100})
 })}),/POINT_PAYMENT_BINDING_FAILED/);
 await assert.rejects(fetchPointPayment({...args,fetchImpl:async()=>({ok:false})}),/POINT_PROVIDER_LOOKUP_FAILED/);
 let called=false;
 await assert.rejects(fetchPointPayment({...args,pointPaymentId:'../abc',fetchImpl:async()=>{called=true;}}),/POINT_VERIFICATION_CONFIG_INVALID/);
 assert.equal(called,false);
});
