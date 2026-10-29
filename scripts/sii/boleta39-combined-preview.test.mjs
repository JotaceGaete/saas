import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildBoleta39CombinedPreview} from './boleta39-combined-preview.mjs';
const cases=JSON.parse(readFileSync(new URL('./fixtures/artema-boleta39-set.json',import.meta.url),'utf8')).cases;
const issuer={rut:'76086428-5',legalName:'Comercio & Servicios',businessActivity:'Comercio',address:'Calle 123',commune:'Santiago',resolutionDate:'2024-01-01',resolutionNumber:80};
const operation={documentType:39,folio:123,issuedOn:'2026-10-28'};
test('five official cases join to non-fiscal diagnostic container',()=>{
 for(const c of cases){
  const r=buildBoleta39CombinedPreview({issuer,operation,certificationCase:c});
  assert.equal(r.ok,true);
  assert.equal(r.caseId,c.id);
  assert.match(r.xml,/<WalinkaNonFiscalCombinedPreview version="1">/);
  assert.match(r.xml,/<Folio>123<\/Folio>/);
  assert.match(r.xml,/<RUTEmisor>76086428-5<\/RUTEmisor>/);
  assert.match(r.xml,/Comercio &amp; Servicios/);
  assert.match(r.xml,new RegExp('<RazonRef>'+c.id+'</RazonRef>'));
  assert.equal(r.transmittable,false);
  assert.equal(r.schemaValid,false);
  assert.doesNotMatch(r.xml,/<(?:TED|CAF|Signature)(?:\s|>)/);
 }
});
test('invalid issuer rejected before candidate generation',()=>{
 const r=buildBoleta39CombinedPreview({issuer:{...issuer,rut:'123-4'},operation,certificationCase:cases[0]});
 assert.equal(r.ok,false);
 assert.equal(r.reason,'INVALID_ISSUER_RUT');
 assert.equal(r.xml,undefined);
});
test('mutated official case is rejected',()=>{
 const c=structuredClone(cases[0]);c.items[0].quantity=999;
 assert.throws(()=>buildBoleta39CombinedPreview({issuer,operation,certificationCase:c}),/UNTRUSTED_CERTIFICATION_CASE/);
});
