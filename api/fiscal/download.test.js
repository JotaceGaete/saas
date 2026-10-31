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

test('owner downloads stored XML', async () => {
  const xml = Buffer.from('<?xml version="1.0"?><DTE/>').toString('base64');
  const handler = createFiscalDownloadHandler({
    admin: db({ status: 'issued', folio: 51106, xml_base64: xml }),
    assertOwner: async () => ({ ok: true }),
  });
  const res = response();
  await handler({ ...req, query: { ...req.query, format: 'xml' } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'application/xml');
  assert.equal(res.headers['Content-Disposition'], 'attachment; filename="boleta-51106.xml"');
  assert.equal(res.body.toString('utf8'), '<?xml version="1.0"?><DTE/>');
});

test('download rejects unknown format before authorization', async () => {
  const handler = createFiscalDownloadHandler({
    admin: { from() { throw new Error('must not query'); } },
    assertOwner: async () => { throw new Error('must not authenticate'); },
  });
  const res = response();
  await handler({ ...req, query: { ...req.query, format: 'exe' } }, res);
  assert.equal(res.code, 400);
});

test('download rejects non-GET requests', async () => {
  const handler = createFiscalDownloadHandler({
    admin: { from() { throw new Error('must not query'); } },
    assertOwner: async () => { throw new Error('must not authenticate'); },
  });
  const res = response();
  await handler({ ...req, method: 'POST' }, res);
  assert.equal(res.code, 405);
});
