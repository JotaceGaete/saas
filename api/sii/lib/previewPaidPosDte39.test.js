import {describe,it,expect} from 'vitest';
import {previewPaidPosDte39} from './previewPaidPosDte39.js';
const sample=()=>({
 job:{state:'pending',document_type:39,invoice_id:'sale-1',business_id:'shop-1',operation_id:'WALINKA-DTE39-sale-1'},
 invoice:{id:'sale-1',business_id:'shop-1',source:'pos',status:'pagada',
  paid_at:'2026-10-29T12:00:00Z',issue_date:'2026-10-29',total:1000},
 business:{country_code:'CL'},
 issuer:{enabled:true,verified:true,issuer_rut:'77804207-K'},
 taxConfig:{default_is_exempt:false,confirmed_by_owner:true},
 items:[{name:'Producto',unit_price:1000,quantity:1,subtotal:1000}],
 payments:[{payment_method:'cash',payment_status:'received',amount:1000,voided_at:null}]
});
describe('read-only POS DTE39 preview',()=>{
 it('prepares a 1000 CLP boleta without provider calls',()=>{
  const result=previewPaidPosDte39(sample());
  expect(result).toMatchObject({ready:true,total:1000,documentType:39,paymentCode:'EF'});
 });
 it.each(['unknown','issued','failed','skipped'])('refuses terminal or uncertain state %s',(state)=>{
  const input=sample();input.job.state=state;
  expect(()=>previewPaidPosDte39(input)).toThrow('FISCAL_JOB_NOT_PREVIEWABLE');
 });
 it('refuses wrong invoice',()=>{
  const input=sample();input.job.invoice_id='different';
  expect(()=>previewPaidPosDte39(input)).toThrow('JOB_INVOICE_MISMATCH');
 });
 it('refuses unconfirmed payment',()=>{
  const input=sample();input.payments[0].payment_status='pending';
  expect(()=>previewPaidPosDte39(input)).toThrow('UNCONFIRMED_PAYMENT');
 });
});
