import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFiscalSaleSnapshot} from './fiscal-sale-snapshot.mjs';
function fixture() {
 return {businessId:'b1',issuerRut:'12345678-5',
 sale:{id:'s1',business_id:'b1',status:'pagada',paid_at:'2026-10-28T12:00:00Z',total:1000},
 items:[{id:'i1',invoice_id:'s1',name:'Servicio de prueba',quantity:1,unit_price:1000,subtotal:1000}],
 payments:[{invoice_id:'s1',payment_status:'received',voided_at:null,amount:1000,payment_method:'cash'}],
 taxes:[{businessId:'b1',saleId:'s1',invoiceItemId:'i1',verified:true,category:'IVA_AFECTO_19'}]};
}
test('builds immutable diagnostic snapshot, not fiscal authorization',()=>{
 const r=buildFiscalSaleSnapshot(fixture());
 assert.equal(r.ok,true);assert.equal(r.fiscalEligible,false);
 assert.equal(r.snapshot.lines[0].name,'Servicio de prueba');
 assert.equal(Object.isFrozen(r.snapshot),true);
 assert.equal(Object.isFrozen(r.snapshot.lines),true);
 assert.equal(Object.isFrozen(r.snapshot.lines[0]),true);
});
for(const [label,mutate,reason] of [
 ['other tenant',f=>f.sale.business_id='b2','IDENTITY_MISMATCH'],
 ['unpaid',f=>f.sale.status='pendiente','SALE_NOT_SETTLED'],
 ['missing name',f=>delete f.items[0].name,'INVALID_LINE'],
 ['duplicate item',f=>f.items.push({...f.items[0]}),'INCOMPLETE_DATA'],
 ['tampered total',f=>f.sale.total=999,'LINE_TOTAL_MISMATCH'],
 ['unverified tax',f=>f.taxes[0].verified=false,'UNVERIFIED_TAX'],
 ['wrong tax tenant',f=>f.taxes[0].businessId='b2','UNVERIFIED_TAX'],
 ['failed payment',f=>f.payments[0].payment_status='failed','INVALID_PAYMENT'],
 ['voided payment',f=>f.payments[0].voided_at='2026-10-28','INVALID_PAYMENT'],
 ['short payment',f=>f.payments[0].amount=500,'PAYMENT_TOTAL_MISMATCH'],
 ['fractional peso',f=>f.items[0].subtotal=999.5,'INVALID_LINE']
]) test('denies '+label,()=>{
 const f=fixture();mutate(f);const r=buildFiscalSaleSnapshot(f);
 assert.equal(r.ok,false);assert.equal(r.reason,reason);
});

test('accepts exact integer CLP values returned as NUMERIC strings',()=>{
 const f=fixture();f.sale.total='1000.00';f.items[0].subtotal='1000.00';
 f.items[0].unit_price='1000.00';f.items[0].quantity='1';
 f.payments[0].amount='1000.00';
 const r=buildFiscalSaleSnapshot(f);
 assert.equal(r.ok,true);assert.equal(r.snapshot.total,1000);
 assert.equal(r.snapshot.lines[0].subtotal,1000);
});
test('denies unknown payment method',()=>{
 const f=fixture();f.payments[0].payment_method='unknown';
 assert.equal(buildFiscalSaleSnapshot(f).reason,'INVALID_PAYMENT');
});
test('denies fractional CLP returned as NUMERIC string',()=>{
 const f=fixture();f.sale.total='1000.50';
 assert.equal(buildFiscalSaleSnapshot(f).reason,'SALE_NOT_SETTLED');
});
