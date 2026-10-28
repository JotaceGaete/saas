import test from 'node:test';
import assert from 'node:assert/strict';
import {buildUnsignedBoleta39Draft} from './boleta39-unsigned-draft.mjs';
const fixture=()=>({ok:true,fiscalEligible:false,snapshot:{saleId:'s1',total:1190,lines:[{name:'Jabón & crema <prueba>',subtotal:1190,taxCategory:'IVA_AFECTO_19'}]}});
test('produces clearly incomplete, unsigned, nontransmittable XML skeleton',()=>{
 const r=buildUnsignedBoleta39Draft({prepared:fixture()});
 assert.equal(r.ok,true);assert.equal(r.schemaValid,false);
 assert.equal(r.fiscalEligible,false);assert.equal(r.signed,false);
 assert.equal(r.transmittable,false);assert.equal(r.siiValidated,false);
 assert.match(r.xml,/<TipoDTE>39<\/TipoDTE>/);
 assert.match(r.xml,/Jabón &amp; crema &lt;prueba&gt;/);
 assert.doesNotMatch(r.xml,/<Folio>|<TED|<Signature|<RUTEmisor>/);
});
test('denies tampering, unsupported tax and claimed fiscal eligibility',()=>{
 for(const p of [
  {...fixture(),fiscalEligible:true},
  {...fixture(),snapshot:{...fixture().snapshot,total:1189}},
  {...fixture(),snapshot:{...fixture().snapshot,lines:[{name:'x',subtotal:1190,taxCategory:'EXENTO'}]}},
  {...fixture(),snapshot:{...fixture().snapshot,lines:[]}}
 ]) assert.equal(buildUnsignedBoleta39Draft({prepared:p}).ok,false);
});

test('rejects XML-invalid control characters and impossible dates',()=>{
 const p=fixture();p.snapshot.lines[0].name='Producto\u0001 inválido';
 assert.equal(buildUnsignedBoleta39Draft({prepared:p}).reason,'UNSUPPORTED_DOCUMENT');
 assert.equal(buildUnsignedBoleta39Draft({prepared:fixture(),issueDate:'2026-02-30'}).reason,'UNSUPPORTED_DOCUMENT');
 assert.equal(buildUnsignedBoleta39Draft({prepared:fixture(),issueDate:'2026-13-01'}).reason,'UNSUPPORTED_DOCUMENT');
});
