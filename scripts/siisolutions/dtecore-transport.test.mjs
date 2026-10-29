import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDteCoreDocumentTransport } from '../../api/_lib/siisolutions-dtecore-transport.js';

test('read-only retrieval uses authenticated DTE 39 paths',async()=>{
  const calls=[];
  const transport=createDteCoreDocumentTransport({
    apiKey:'test-server-secret',
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return {ok:true,json:async()=>({example:true})};
    },
  });
  assert.deepEqual(await transport.getXml(123),{ok:true,body:{example:true}});
  assert.deepEqual(await transport.getPdf(123),{ok:true,body:{example:true}});
  assert.deepEqual(calls.map(c=>c.url),[
    'https://api.siisolutions.cl/dte/documentos/39/123/xml',
    'https://api.siisolutions.cl/dte/documentos/39/123/pdf',
  ]);
  assert.ok(calls.every(c=>c.options.method==='GET' && c.options.headers['x-api-key']==='test-server-secret'));
});
test('invalid folio and unsafe origin are rejected',async()=>{
  const transport=createDteCoreDocumentTransport({apiKey:'test',fetchImpl:async()=>{throw Error('unexpected fetch');}});
  await assert.rejects(transport.getXml(0),/Invalid document lookup/);
  assert.throws(()=>createDteCoreDocumentTransport({apiKey:'test',baseUrl:'http://api.siisolutions.cl'}),/Invalid DTECore base URL/);
  assert.throws(()=>createDteCoreDocumentTransport({apiKey:'test',baseUrl:'https://user:password@api.siisolutions.cl/'}),/Invalid DTECore base URL/);
});
test('provider non-200 response is not treated as an original document',async()=>{
  const transport=createDteCoreDocumentTransport({apiKey:'test',fetchImpl:async()=>({ok:false,status:404})});
  assert.deepEqual(await transport.getXml(42),{ok:false,status:404});
});
