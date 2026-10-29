import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {coordinatePointFiscalPreparation}=require('./point-fiscal-coordinator.cjs');
const businessId='b1',saleId='s1',pointPaymentId='123';
const sale={id:saleId,business_id:businessId,status:'pagada',paid_at:'2026-10-29T12:00:00Z',total:100};
const payment={id:123,order_id:'order1',business_id:businessId,sale_id: saleId,source:'mercado_pago_point',verifiedByServer:true,status:'approved',amount:100};
function harness(overrides={}){
 let linked=false,records=0,prepares=0;
 const args={businessId,saleId,pointPaymentId,loadSale:async()=>sale,
  verifyPointPayment:async()=>payment,isPaymentLinked:async()=>linked,
  recordPayment:async()=>{records++;linked=true;},
  prepareFiscal:async({operationKey})=>{prepares++;return {operationKey,status:'pending'};},...overrides};
 return {args,counts:()=>({records,prepares})};
}
test('approved Point payment is durably linked before fiscal preparation, no issuance',async()=>{
 const h=harness();
 const result=await coordinatePointFiscalPreparation(h.args);
 assert.equal(result.status,'prepared');assert.equal(result.emissionEnabled,false);
 assert.deepEqual(h.counts(),{records:1,prepares:1});
});
test('rejected payment cannot record or prepare fiscal operation',async()=>{
 const h=harness({verifyPointPayment:async()=>({...payment,status:'rejected'})});
 const result=await coordinatePointFiscalPreparation(h.args);
 assert.equal(result.status,'blocked');assert.deepEqual(h.counts(),{records:0,prepares:0});
});
test('untrusted and mismatched payment cannot record or prepare',async()=>{
 for(const changed of [{verifiedByServer:false},{amount:200},{business_id:'other'},{sale_id:'other'}]){
  const h=harness({verifyPointPayment:async()=>({...payment,...changed})});
  const result=await coordinatePointFiscalPreparation(h.args);
  assert.equal(result.status,'blocked');assert.deepEqual(h.counts(),{records:0,prepares:0});
 }
});
test('payment persistence uncertainty blocks fiscal preparation',async()=>{
 const h=harness({recordPayment:async()=>{throw Error('db unavailable');}});
 const result=await coordinatePointFiscalPreparation(h.args);
 assert.equal(result.reason,'RECONCILIATION_REQUIRED');assert.equal(h.counts().prepares,0);
});

test('provider preparation must confirm a pending operation before success',async()=>{
 const h=harness({prepareFiscal:async({operationKey})=>({operationKey,status:'submitted'})});
 const result=await coordinatePointFiscalPreparation(h.args);
 assert.equal(result.status,'blocked');assert.equal(result.reason,'FISCAL_PREPARATION_UNCONFIRMED');
});
