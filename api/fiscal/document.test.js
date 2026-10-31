import test from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalDocumentHandler } from './document.js';

const businessId = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const invoiceId = 'b4f3144c-34b0-4f87-ada9-96bac0d90295';
function response() {
  return { headers: {}, setHeader(k,v) { this.headers[k]=v; }, status(n) { this.statusCode=n; return this; }, json(body) { this.body=body; return this; } };
}
function setup({ authorized=true, invoice=true, document=true, errorTable=null }={}) {
  const calls=[];
  const admin={ from(table) {
    calls.push(table);
    const filters=[];
    const builder={
      select() { return this; },
      eq(k,v) { filters.push([k,v]); return this; },
      async maybeSingle() {
        if (errorTable===table) return { data:null,error:new Error('db') };
        if (table==='crm_invoices') return { data: invoice ? {id:invoiceId,total:100}:null,error:null };
        if (table==='crm_fiscal_issuances') return {data:document ? {sale_id:invoiceId,status:'issued',folio:51106,error_code:null,created_at:'2026-10-31',updated_at:'2026-10-31'}:null,error:null};
        throw new Error('Unexpected table');
      },
    };
    return builder;
  }};
  const assertOwner=async ()=>authorized ? {ok:true,actorId:'actor'} : {ok:false,status:403,error:'BUSINESS_NOT_AUTHORIZED'};
  const handle=createFiscalDocumentHandler({admin,assertOwner});
  const request={method:'GET',headers:{authorization:'Bearer token'},query:{businessId,invoiceId}};
  return {handle,request,calls};
}
test('GET returns only existing fiscal metadata and does not emit',async()=>{
  const {handle,request,calls}=setup();const res=response();
  await handle(request,res);
  assert.equal(res.statusCode,200);
  assert.deepEqual(res.body.document,{saleId:invoiceId,dteType:39,status:'issued',folio:51106,reason:null,total:100,createdAt:'2026-10-31',updatedAt:'2026-10-31'});
  assert.deepEqual(calls,['crm_invoices','crm_fiscal_issuances']);
  assert.equal(res.headers['Cache-Control'],'private, no-store');
});
test('GET rejects unauthorized business before database lookup',async()=>{
  const {handle,request,calls}=setup({authorized:false});const res=response();
  await handle(request,res);assert.equal(res.statusCode,403);assert.deepEqual(calls,[]);
});
test('GET does not expose fiscal data when invoice is missing',async()=>{
  const {handle,request,calls}=setup({invoice:false});const res=response();
  await handle(request,res);assert.equal(res.statusCode,404);assert.deepEqual(calls,['crm_invoices']);
});
test('GET returns null for an invoice without a fiscal document',async()=>{
  const {handle,request}=setup({document:false});const res=response();
  await handle(request,res);assert.equal(res.statusCode,200);assert.deepEqual(res.body,{document:null});
});
test('GET validates invoice id and rejects write methods',async()=>{
  const {handle,request,calls}=setup();const invalid=response();
  await handle({...request,query:{businessId,invoiceId:'bad'}},invalid);assert.equal(invalid.statusCode,400);
  const post=response();await handle({...request,method:'POST'},post);assert.equal(post.statusCode,405);
  assert.deepEqual(calls,[]);
});
test('GET surfaces database failure without leaking details',async()=>{
  const {handle,request}=setup({errorTable:'crm_fiscal_issuances'});const res=response();
  await handle(request,res);assert.equal(res.statusCode,503);assert.deepEqual(res.body,{error:'SERVER_ERROR'});
});
