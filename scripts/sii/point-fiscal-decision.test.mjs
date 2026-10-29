import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {decidePointFiscalAction}=require('./point-fiscal-decision.cjs');
const businessId='b1',sale={id:'s1',business_id:businessId,total:100,status:'pagada',paid_at:'2026-10-29T12:00:00Z'};
const payment={id:'p1',order_id:'o1',business_id:businessId,sale_id:'s1',source:'mercado_pago_point',verifiedByServer:true,status:'approved',amount:100};
const base={businessId,sale,payment,expectedAmount:100,paymentAlreadyLinked:true};
test('approved and reconciled Point payment prepares fiscal operation, never emits',()=>{
 const r=decidePointFiscalAction(base);
 assert.equal(r.action,'prepare_fiscal');assert.equal(r.operationKey,'b1:s1:39');assert.equal(r.emissionEnabled,false);
});
test('rejected or pending Point payment never prepares',()=>{
 for(const status of ['rejected','pending','cancelled','refunded','in_process'])
 assert.equal(decidePointFiscalAction({...base,payment:{...payment,status}}).action,'block');
});
test('browser claims, mismatched tenant, sale, amount and payment link fail closed',()=>{
 const cases=[
 {...base,payment:{...payment,verifiedByServer:false}},
 {...base,payment:{...payment,business_id:'b2'}},
 {...base,payment:{...payment,sale_id:'s2'}},
 {...base,payment:{...payment,amount:101}},
 {...base,payment:{...payment,source:'cash'}},
 {...base,sale:{...sale,status:'pendiente'}},
 {...base,expectedAmount:101},
 ];
 for(const args of cases)assert.equal(decidePointFiscalAction(args).action,'block');
});
test('approved Point payment must be recorded once before fiscal preparation',()=>{
 const r=decidePointFiscalAction({...base,paymentAlreadyLinked:false});
 assert.equal(r.action,'record_payment_first');assert.equal(r.emissionEnabled,undefined);
});
