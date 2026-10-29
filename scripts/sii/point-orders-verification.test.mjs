import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {fetchVerifiedPointOrder}=require('./point-orders-verification.cjs');
const operation={business_id:'b1',crm_invoice_id:'s1',mp_order_id:'ord1',external_reference:'ref1',
 mp_payment_id:'123',mp_status:'processed',finalized_at:'2026-10-29',amount:100,currency:'CLP'};
const raw={id:'ord1',external_reference:'ref1',status:'processed',
 transactions:{payments:[{id:'123',status:'approved',amount:'100'}]}};
function check(rawOrder,operationOverride=operation){
 return fetchVerifiedPointOrder({accessToken:'test',operation:operationOverride,businessId:'b1',saleId:'s1',
 fetchImpl:async(url,opts)=>{assert.equal(url,'https://api.mercadopago.com/v1/orders/ord1');
 assert.equal(opts.headers.Authorization,'Bearer test');return {ok:true,json:async()=>rawOrder};}});
}
test('accepts one approved transaction matching persisted Point order',async()=>{
 const p=await check(raw);assert.equal(p.verifiedByServer,true);assert.equal(p.amount,100);
});
test('rejects mismatched order, payment, reference, amount and unfinalized operation',async()=>{
 for(const order of [{...raw,id:'other'},{...raw,external_reference:'wrong'},
  {...raw,transactions:{payments:[{id:'999',status:'approved',amount:'100'}]}},
  {...raw,transactions:{payments:[{id:'123',status:'pending',amount:'100'}]}},
  {...raw,transactions:{payments:[{id:'123',status:'approved',amount:'200'}]}},
  {...raw,transactions:{payments:[{id:'123',status:'approved',amount:'100'},{id:'124',status:'approved',amount:'100'}]}}])
 await assert.rejects(check(order),/POINT_ORDER_VERIFICATION_FAILED/);
 await assert.rejects(check(raw,{...operation,finalized_at:null}),/POINT_ORDER_VERIFICATION_FAILED/);
});
