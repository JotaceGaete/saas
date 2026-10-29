import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildBoletaPayload, emitirBoleta } = require('../../api/lib/siiSolutionsBoleta.js');
const base = {businessId:'bonita',saleId:'sale-001',operatorRut:'11111111-1',items:[{description:'Producto real',unitPrice:100,quantity:1}],paymentMethod:'cash',paidAmount:100};
test('payload DTE39 has stable operation id and no manually assigned folio',()=>{
  const a=buildBoletaPayload(base);
  assert.equal(a.idBoletaOperacion,'bonita:sale-001:39');
  assert.equal(a.medioPago,'EF');
  assert.equal(a.formatoPdf,'80mm');
  assert.equal(a.detalles[0].precioSubtotal,100);
  assert.equal(Object.hasOwn(a,'folio'),false);
});
test('rejects missing issuer, unsupported payment and mismatched totals',()=>{
  assert.throws(()=>buildBoletaPayload({...base,operatorRut:''}));
  assert.throws(()=>buildBoletaPayload({...base,paymentMethod:'bitcoin'}));
  assert.throws(()=>buildBoletaPayload({...base,paidAmount:101}));
  assert.throws(()=>buildBoletaPayload({...base,items:[{description:'x',unitPrice:50.5,quantity:2}]}));
});
test('does not call provider without server-side credential',async()=>{
  await assert.rejects(()=>emitirBoleta({payload:buildBoletaPayload(base)}),/API key/);
});
test('sends x-api-key and stable operation id to provider',async()=>{
  let request;
  const result=await emitirBoleta({apiKey:'test-only',payload:buildBoletaPayload(base),
    fetchImpl:async(url,options)=>{
      request={url,options};
      return {ok:true,status:200,json:async()=>({success:true,folio:51104})};
    }});
  assert.equal(result.status,'submitted');
  assert.equal(request.url,'https://api.siisolutions.cl/dte/boletas/emitir');
  assert.equal(request.options.headers['x-api-key'],'test-only');
  assert.equal(JSON.parse(request.options.body).idBoletaOperacion,'bonita:sale-001:39');
});
test('409 recovers existing folio without retrying',async()=>{
  const result=await emitirBoleta({apiKey:'test-only',payload:buildBoletaPayload(base),
    fetchImpl:async()=>({ok:false,status:409,json:async()=>({success:false,folioExistente:51104})})});
  assert.deepEqual({status:result.status,folio:result.folio},{status:'already_issued',folio:51104});
});
test('ambiguous 200 and unrecoverable 409 fail closed',async()=>{
  const payload=buildBoletaPayload(base);
  await assert.rejects(()=>emitirBoleta({apiKey:'test-only',payload,
    fetchImpl:async()=>({ok:true,status:200,json:async()=>({})})}),/unknown result/);
  await assert.rejects(()=>emitirBoleta({apiKey:'test-only',payload,
    fetchImpl:async()=>({ok:false,status:409,json:async()=>({success:false})})}),/recoverable folio/);
});
