import {describe,it,expect} from 'vitest';
import {previewPaidPosDte39} from './previewPaidPosDte39.js';

// Snapshot of the commercial fields from a real CLP 1,000 POS sale.
// No customer identifiers, credentials or provider calls.
const sale=()=>({
 job:{state:'pending',document_type:39,invoice_id:'d74e417c-9c08-460a-98e8-1ad93000a454',business_id:'cda904a1-e331-4bd4-9f33-a6715687d3dd',operation_id:'WALINKA-DTE39-d74e417c-9c08-460a-98e8-1ad93000a454'},
 invoice:{id:'d74e417c-9c08-460a-98e8-1ad93000a454',business_id:'cda904a1-e331-4bd4-9f33-a6715687d3dd',source:'pos',status:'pagada',paid_at:'2026-10-27T15:33:28Z',issue_date:'2026-10-27',total:1000},
 business:{country_code:'CL'},
 issuer:{issuer_rut:'77804207-K',enabled:false,verified:false},
 taxConfig:{default_is_exempt:false,confirmed_by_owner:true},
 items:[{name:'OFERTAS 1000',quantity:1,unit_price:1000,subtotal:1000}],
 payments:[{amount:1000,voided_at:null,payment_method:'cash',payment_status:'received'}]
});
describe('real pilot sale dry-run safety',()=>{
 it('rejects the real sale because the issuer is disabled',()=>{
  expect(()=>previewPaidPosDte39(sale())).toThrow('ISSUER_NOT_VERIFIED');
 });
 it('can prepare the 1000 CLP amounts with a verified issuer fixture',()=>{
  const s=sale();s.issuer.enabled=true;s.issuer.verified=true;
  expect(previewPaidPosDte39(s)).toMatchObject({ready:true,total:1000,lines:1,paymentCode:'EF'});
 });
 it('rejects a mismatch between paid amount and invoice',()=>{
  const s=sale();s.issuer.enabled=true;s.issuer.verified=true;s.payments[0].amount=999;
  expect(()=>previewPaidPosDte39(s)).toThrow('PAYMENTS_TOTAL_MISMATCH');
 });
});
