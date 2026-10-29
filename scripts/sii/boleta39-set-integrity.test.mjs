import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {verifyOfficialBoletaCase,officialBoletaCaseDigests} from './boleta39-set-integrity.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
test('five unchanged certification cases match their fixture digests',()=>{
 assert.equal(officialBoletaCaseDigests.length,5);
 for(const c of cases){
  const result=verifyOfficialBoletaCase(c);
  assert.equal(result.ok,true);
  assert.equal(result.fiscalEligible,false);
  assert.equal(result.transmittable,false);
 }
});
test('mutated quantity, price, name, tax and reference are rejected',()=>{
 for(const field of ['quantity','unitPriceWithIva','name','tax']){
  const c=structuredClone(cases[0]);
  c.items[0][field]=field==='name'?'otro':field==='tax'?'exento':999;
  assert.equal(verifyOfficialBoletaCase(c).reason,'ALTERED_CASE');
 }
 const altered=structuredClone(cases[4]);
 altered.items[0].unit='Unidades';
 assert.equal(verifyOfficialBoletaCase(altered).ok,false);
});
test('unknown cases and injected metadata are rejected',()=>{
 assert.equal(verifyOfficialBoletaCase({id:'CASO-6'}).reason,'UNKNOWN_CASE');
 assert.equal(verifyOfficialBoletaCase({...cases[0],folio:123}).reason,'ALTERED_CASE');
});
