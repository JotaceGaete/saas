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
});
test('does not call provider without server-side credential',async()=>{
  await assert.rejects(()=>emitirBoleta({payload:buildBoletaPayload(base)}),/API key/);
});
