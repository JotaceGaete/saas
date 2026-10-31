import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFiscalOriginalDocumentLoader } from '../../api/_lib/siisolutions-original-document-loader.js';

const businessId='11111111-1111-4111-8111-111111111111';
const saleId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const operationId='WLK-'+businessId+'-'+saleId;
const input={businessId,saleId,operationId};
const original={...input,source:'authenticated-provider-read',dteType:39,provider:'siisolutions',folio:101,xmlBase64:'eG1s',pdfBase64:'cGRm'};

test('requires both trusted retrieval and independent verifier',()=>{
  assert.throws(()=>createFiscalOriginalDocumentLoader({retrieveOriginal:async()=>original}),/required/);
  assert.throws(()=>createFiscalOriginalDocumentLoader({verifyOriginal:async()=>true}),/required/);
});

test('read-only authenticated original can be loaded and independently verified',async()=>{
  const loader=createFiscalOriginalDocumentLoader({retrieveOriginal:async()=>original,verifyOriginal:async()=>true});
  const document=await loader.loadOriginalDocument(input);
  assert.equal(document.folio,101);
  assert.equal(await loader.verifyOriginalDocument({...input,document}),true);
});

test('untrusted or mismatched originals cannot be loaded',async()=>{
  for(const change of [{source:'request-body'},{businessId:'other'},{saleId:'other'},{operationId:'other'},{dteType:41},{provider:'other'}]){
    const loader=createFiscalOriginalDocumentLoader({retrieveOriginal:async()=>({...original,...change}),verifyOriginal:async()=>true});
    assert.equal(await loader.loadOriginalDocument(input),null);
  }
});

test('independent verification failure blocks reconciliation',async()=>{
  const loader=createFiscalOriginalDocumentLoader({retrieveOriginal:async()=>original,verifyOriginal:async()=>false});
  const document=await loader.loadOriginalDocument(input);
  assert.equal(await loader.verifyOriginalDocument({...input,document}),false);
});
