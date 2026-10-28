import test from 'node:test';
import assert from 'node:assert/strict';
import { reserveWalinkaFiscalPilot } from './walinka-fiscal-entry.mjs';

function fixture({userId='actor-1',error=null}={}) {
  let reserved=0;
  const records={
    wa_businesses:[{id:'business-1',user_id:'actor-1',country_code:'CL',is_active:true}],
    crm_invoices:[{id:'sale-1',business_id:'business-1',status:'pagada',paid_at:'2026-10-28T12:00:00Z',total:1000}],
    crm_invoice_items:[{id:'line-1',invoice_id:'sale-1',quantity:1,unit_price:1000,subtotal:1000}],
    crm_payments:[{invoice_id:'sale-1',amount:1000,payment_method:'cash',payment_status:'received',voided_at:null}]
  };
  const db={from(table){
    const filters=[];
    const q={select(){return q;},eq(k,v){filters.push([k,v]);return q;},
      then(resolve,reject){
        const rows=(records[table]||[]).filter(row=>filters.every(([k,v])=>row[k]===v));
         
        return Promise.resolve({data:rows,error:null}).then(resolve,reject);
      },
      async maybeSingle(){return {data:(records[table]||[]).find(row=>filters.every(([k,v])=>row[k]===v))||null,error:null};}};
    return q;
  }};
  return {
    args:{
      accessToken:'opaque-token',businessId:'business-1',saleId:'sale-1',
      authClient:{auth:{async getUser(token){assert.equal(token,'opaque-token');return {data:{user:userId?{id:userId}:null},error};}}},
      db,
      taxMapping:{async getVerifiedLineTaxes({businessId,saleId}){return [{businessId,saleId,invoiceItemId:'line-1',category:'IVA_AFECTO_19',verified:true}];}},
      issuerRegistry:{async getVerifiedIssuer(businessId){return {businessId,issuerRut:'12345678-5',issuerVerified:true,fiscalEnabled:true};}},
      reserve:async()=>{reserved++;return {folio:700};}
    },
    get reserved(){return reserved;}
  };
}
test('verified Supabase owner still fails closed until fiscal sale binding exists',async()=>{
  const f=fixture();
  await assert.rejects(reserveWalinkaFiscalPilot(f.args),/Sale not authorized/);
  assert.equal(f.reserved,0);
});
test('unverified token is rejected before reading fiscal data',async()=>{
  const f=fixture({userId:null,error:new Error('expired')});
  await assert.rejects(reserveWalinkaFiscalPilot(f.args),/authentication failed/);
  assert.equal(f.reserved,0);
});
test('foreign authenticated user cannot issue',async()=>{
  const f=fixture({userId:'actor-2'});
  await assert.rejects(reserveWalinkaFiscalPilot(f.args),/actor not authorized/);
  assert.equal(f.reserved,0);
});
test('missing bearer token is rejected',async()=>{
  const f=fixture();f.args.accessToken='';
  await assert.rejects(reserveWalinkaFiscalPilot(f.args),/session required/);
  assert.equal(f.reserved,0);
});
