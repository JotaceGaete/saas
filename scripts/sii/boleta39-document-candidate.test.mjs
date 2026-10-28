import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBoleta39DocumentCandidate} from './boleta39-document-candidate.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
test('all five cases generate non-fiscal DTE-shaped XML with SII namespace',()=>{
 for(const c of cases){
  const d=buildBoleta39DocumentCandidate(c);
  assert.match(d.xml,/<DTE xmlns="http:\/\/www\.sii\.cl\/SiiDte" version="1\.0">/);
  assert.match(d.xml,/<TipoDTE>39<\/TipoDTE>/);
  assert.match(d.xml,new RegExp('<RazonRef>'+c.id+'</RazonRef>'));
  assert.match(d.xml,/<CodRef>SET<\/CodRef>/);
  assert.equal(d.transmittable,false);
  assert.equal(d.schemaValid,false);
  assert.equal(d.signed,false);
  assert.doesNotMatch(d.xml,/<(?:TED|CAF|Signature)(?:\s|>)/);
 }
});
test('exempt line and Kg unit map to candidate fields',()=>{
 assert.match(buildBoleta39DocumentCandidate(cases[3]).xml,/<IndExe>1<\/IndExe>/);
 assert.match(buildBoleta39DocumentCandidate(cases[4]).xml,/<UnmdItem>Kg<\/UnmdItem>/);
});
test('altered official set cases cannot enter candidate builder',()=>{
 const c=structuredClone(cases[0]);
 c.items[0].quantity=2;
 assert.throws(()=>buildBoleta39DocumentCandidate(c),/UNTRUSTED_CERTIFICATION_CASE/);
});
