import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalDownloadHandler } from './download.js';

const B = '0b6e2f1a-3c4d-4e5f-8a9b-0c1d2e3f4a5b';
const S = '1c7f3e2b-4d5e-4f60-9b0c-1d2e3f4a5b6c';
const pdf = Buffer.from('%PDF-1.4\nmock document').toString('base64');

function response() {
  return { headers: {}, code: 0, body: null,
    setHeader(k,v) { this.headers[k]=v; return this; },
    status(n) { this.code=n; return this; },
    json(v) { this.body=v; return this; },
    send(v) { this.body=v; return this; } };
}
function db(document) {
  return { from(table) {
    const q = { select() { return q; }, eq() { return q; },
      async maybeSingle() { return { data: table === 'crm_invoices' ? { id: S } : document, error: null }; } };
    return q;
  } };
}
const req = { method:'GET', headers:{ authorization:'Bearer example' }, query:{ businessId:B, invoiceId:S, format:'pdf' } };

test('owner downloads stored PDF without contacting provider', async () => {
  const handler = createFiscalDownloadHandler({ admin:db({status:'issued',folio:51106,pdf_base64:pdf}), assertOwner:async()=>({ok:true}) });
  const res=response();
  await handler(req,res);
  assert.equal(res.code,200);
  assert.equal(res.headers['Content-Type'],'application/pdf');
  assert.equal(res.body.toString('utf8'),'%PDF-1.4\nmock document');
});
test('non-owner is denied before database access', async () => {
  const handler = createFiscalDownloadHandler({ admin:{from(){throw new Error('must not query')}}, assertOwner:async()=>({ok:false,status:403,error:'BUSINESS_NOT_AUTHORIZED'}) });
  const res=response(); await handler(req,res);
  assert.equal(res.code,403);
});
test('unissued documents cannot be downloaded', async () => {
  const handler = createFiscalDownloadHandler({ admin:db({status:'unknown',folio:51106,pdf_base64:pdf}), assertOwner:async()=>({ok:true}) });
  const res=response(); await handler(req,res);
  assert.equal(res.code,404);
});
test('invalid document content is not served', async () => {
  const handler = createFiscalDownloadHandler({ admin:db({status:'issued',folio:51106,pdf_base64:Buffer.from('not a pdf').toString('base64')}), assertOwner:async()=>({ok:true}) });
  const res=response(); await handler(req,res);
  assert.equal(res.code,503);
});
