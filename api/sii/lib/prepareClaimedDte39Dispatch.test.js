import {describe,it,expect} from 'vitest';
import {prepareClaimedDte39Dispatch as prepare} from './prepareClaimedDte39Dispatch.js';
const fixture=()=>({
 snapshot:{
  job:{id:'job-1',document_type:39,state:'claimed',invoice_id:'sale-1',business_id:'shop-a',operation_id:'op-a'},
  invoice:{id:'sale-1',business_id:'shop-a',source:'pos',status:'pagada',paid_at:'2026-10-30T12:00:00Z',issue_date:'2026-10-30',total:1000},
  business:{country_code:'CL'},
  issuer:{business_id:'shop-a',issuer_rut:'77804207-K',enabled:true,verified:true},
  taxConfig:{default_is_exempt:false,confirmed_by_owner:true},
  items:[{name:'Producto',unit_price:1000,quantity:1,subtotal:1000}],
  payments:[{payment_method:'cash',payment_status:'received',amount:1000,voided_at:null}]
 },
 control:{enabled:true,payment_voucher_policy_approved:true},
 credentials:{business_id:'shop-a',apiKey:'secret',baseUrl:'https://tenant.example.cl'}
});
describe('claimed DTE39 trusted snapshot preflight',()=>{
 it('prepares an isolated cash boleta without contacting DTECore',()=>{
  const plan=prepare(fixture());
  expect(plan.payload).toMatchObject({idBoletaOperacion:'op-a',total:1000,medioPago:'EF'});
 });
 it('refuses a missing issuer tenant identity',()=>{
  const input=fixture();delete input.snapshot.issuer.business_id;
  expect(()=>prepare(input)).toThrow('ISSUER_NOT_VERIFIED');
 });
 it('refuses another tenant credentials',()=>{
  const input=fixture();input.credentials.business_id='shop-b';
  expect(()=>prepare(input)).toThrow('DTECORE_TENANT_CREDENTIALS_REQUIRED');
 });
 it('refuses a card voucher without classification',()=>{
  const input=fixture();input.snapshot.payments[0].payment_method='mercado_pago';
  expect(()=>prepare(input)).toThrow('CARD_VOUCHER_CLASSIFICATION_REQUIRED');
 });
 it('refuses an unclaimed job',()=>{
  const input=fixture();input.snapshot.job.state='pending';
  expect(()=>prepare(input)).toThrow('DTE39_CLAIM_REQUIRED');
 });
});
