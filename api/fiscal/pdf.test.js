import test from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalPdfHandler } from './pdf.js';

const businessId = 'cda904a1-e331-4bd4-9f33-a6715687d3dd';
const invoiceId = 'b4f3144c-34b0-4f87-ada9-96bac0d90295';
const pdfBase64 = Buffer.from('%PDF-1.4\n1 0 obj\n%%EOF').toString('base64');
function mock({ owner=true, invoice=true, issuance=true, status='issued', pdf=pdfBase64, fail=null }={}) {
  const calls=[];
  const admin={from(table) {
    calls.push(table);
    return {select(){return this;},eq(){return this;},async maybeSingle(){
      if(table===fail)return {data:null,error:new Error('secret database failure')};
      if(table==='crm_invoices')return {data:invoice?{id:invoiceId}:null,error:null};
      if(table==='crm_fiscal_issuances')return {data:issuance?{status,folio:51106,pdf_base64:pdf}:null,error:null};
      throw Error('unexpected table');
    }};
  }};
  const handler=createFiscalPdfHandler({admin,assertOwner:async()=>owner?{ok:true}:{ok:false,status:403,error:'FORBIDDEN'}});
  const req={method:'GET',headers:{authorization:'Bearer session'},query:{businessId,invoiceId}};
  const res={headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;},send(bytes){this.bytes=bytes;return this;}};
  return {handler,req,res,calls};
}
test('owner retrieves original PDF bytes without any write',async()=>{
  const x=mock();await x.handler(x.req,x.res);
  assert.equal(x.res.statusCode,200);
  assert.equal(x.res.headers['Content-Type'],'application/pdf');
  assert.equal(x.res.headers['Cache-Control'],'private, no-store');
  assert.equal(x.res.headers['X-Content-Type-Options'],'nosniff');
  assert.equal(x.res.bytes.toString('ascii',0,5),'%PDF-');
  assert.deepEqual(x.calls,['crm_invoices','crm_fiscal_issuances']);
});
test('foreign owner cannot query any invoice or PDF',async()=>{
  const x=mock({owner:false});await x.handler(x.req,x.res);
  assert.equal(x.res.statusCode,403);assert.deepEqual(x.calls,[]);
});
test('missing invoice does not expose issuance',async()=>{
  const x=mock({invoice:false});await x.handler(x.req,x.res);
  assert.equal(x.res.statusCode,404);assert.deepEqual(x.calls,['crm_invoices']);
});
test('missing issuance returns not found',async()=>{
  const x=mock({issuance:false});await x.handler(x.req,x.res);
  assert.equal(x.res.statusCode,404);
});
test('unissued and invalid PDFs are not served',async()=>{
  for(const opts of [{status:'pending'},{pdf:'bm90IHBkZg=='}]){
    const x=mock(opts);await x.handler(x.req,x.res);assert.equal(x.res.statusCode,409);
    assert.equal(x.res.bytes,undefined);
  }
});
test('rejects POST and invalid identifiers without querying database',async()=>{
  const x=mock();await x.handler({...x.req,method:'POST'},x.res);
  assert.equal(x.res.statusCode,405);
  const y=mock();await y.handler({...y.req,query:{businessId,invoiceId:'bad'}},y.res);
  assert.equal(y.res.statusCode,400);assert.deepEqual(y.calls,[]);
});
test('database failure does not leak sensitive details',async()=>{
  const x=mock({fail:'crm_fiscal_issuances'});await x.handler(x.req,x.res);
  assert.equal(x.res.statusCode,503);assert.deepEqual(x.res.body,{error:'SERVER_ERROR'});
});
