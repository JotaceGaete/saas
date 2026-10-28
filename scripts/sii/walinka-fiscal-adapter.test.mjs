import test from 'node:test';
import assert from 'node:assert/strict';
import { createWalinkaFiscalAdapter } from './walinka-fiscal-adapter.mjs';
import { reserveAuthorizedBoleta39 } from './fiscal-authorization.mjs';

function setup({ owner='actor-1', country='CL', active=true, issuerVerified=true, saleTenant='business-1' }={}) {
  const records = {
    wa_businesses: [{ id:'business-1', user_id:owner, country_code:country, is_active:active }],
    crm_invoices: [{ id:'sale-1', business_id:saleTenant, status:'pagada', paid_at:'2026-10-28T12:00:00Z', total:1000 }],
    crm_invoice_items: [{id:'line-1',invoice_id:'sale-1',quantity:1,unit_price:1000,subtotal:1000,discount_amount:0}],
    crm_payments: [{invoice_id:'sale-1',amount:1000,payment_method:'cash',payment_status:'received',voided_at:null}]
  };
  const queries=[];
  const db={from(table){
    const filters=[];
    const q={
      select(){return q;},
      eq(k,v){filters.push([k,v]);return q;},
      then(resolve,reject){
        const rows=(records[table]||[]).filter(row=>filters.every(([k,v])=>row[k]===v));
        queries.push({table,filters}); 
        return Promise.resolve({data:rows,error:null}).then(resolve,reject);
      },
      async maybeSingle(){
        queries.push({table,filters});
        return {data:(records[table]||[]).find(row=>filters.every(([k,v])=>row[k]===v))||null,error:null};
      }
    };
    return q;
  }};
  let reservations=0;
  const deps=createWalinkaFiscalAdapter({
    db,
    taxMapping:{async getVerifiedLineTaxes({businessId,saleId}){return [{businessId,saleId,invoiceItemId:'line-1',category:'IVA_AFECTO_19',verified:true}];}},
    issuerRegistry:{async getVerifiedIssuer(businessId){return {businessId,issuerRut:'12345678-5',issuerVerified,fiscalEnabled:true};}},
    reserve:async ()=>{reservations++;return {folio:700};}
  });
  return {deps,queries,get reservations(){return reservations;}};
}
const input=f=>({actorId:'actor-1',businessId:'business-1',saleId:'sale-1',deps:f.deps});
test('owner, Chilean business and invoice are resolved from actual Walinka tables',async()=>{
  const f=setup();
  assert.equal((await f.deps.canIssue({actorId:'actor-1',businessId:'business-1'})),true);
  assert.equal((await f.deps.getBusiness('business-1')).issuerRut,'12345678-5');
  assert.equal((await f.deps.getSale({businessId:'business-1',saleId:'sale-1'})).fiscalEligible,false);
  assert.deepEqual(new Set(f.queries.map(x=>x.table)),new Set(['wa_businesses','crm_invoices','crm_invoice_items','crm_payments']));
  await assert.rejects(reserveAuthorizedBoleta39(input(f)));
  assert.equal(f.reservations,0);
});
for(const [name,config] of [
  ['foreign owner',{owner:'actor-2'}],
  ['foreign sale',{saleTenant:'business-2'}],
  ['inactive business',{active:false}],
  ['non-Chilean business',{country:'AR'}],
  ['unverified issuer',{issuerVerified:false}]
]) test('denies '+name+' without allocating a folio',async()=>{
  const f=setup(config);
  await assert.rejects(reserveAuthorizedBoleta39(input(f)));
  assert.equal(f.reservations,0);
});
test('requires trusted issuer registry and transactional reservation adapters',()=>{
  assert.throws(()=>createWalinkaFiscalAdapter({db:{from(){}},reserve:async()=>{}}));
});

test('adapter snapshot diagnostic cannot enable fiscal issuance or reserve folios',async()=>{
  const f=setup();
  const result=f.deps.assessPreparedSale({
    businessId:'business-1',issuerRut:'12345678-5',
    sale:{id:'sale-1',business_id:'business-1',status:'pagada',paid_at:'2026-10-28T12:00:00Z',total:1000,discount_amount:0},
    items:[{id:'line-1',invoice_id:'sale-1',name:'Servicio',quantity:1,unit_price:1000,subtotal:1000,discount_amount:0}],
    payments:[{invoice_id:'sale-1',amount:1000,payment_method:'cash',payment_status:'received',voided_at:null}],
    taxes:[{businessId:'business-1',saleId:'sale-1',invoiceItemId:'line-1',category:'IVA_AFECTO_19',verified:true}]
  });
  assert.equal(result.ok,true);
  assert.equal(result.fiscalEligible,false);
  assert.equal((await f.deps.getSale({businessId:'business-1',saleId:'sale-1'})).fiscalEligible,false);
  assert.equal(f.reservations,0);
});
